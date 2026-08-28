import * as net from 'node:net'

import type { S3Client as S3ClientType } from '@aws-sdk/client-s3'
import { loggerService } from '@logger'
import type { S3Config } from '@types'
import { Readable } from 'stream'

// ponytail: @aws-sdk/client-s3 体积大且仅 S3 备份时需要, 动态加载避免主进程启动即常驻内存;
// 若未来 SDK 提供更轻的按需 client 可替换此加载层。
// oxlint-disable-next-line typescript-eslint(consistent-type-imports) -- 类型取自动态加载的 SDK 模块
type S3Sdk = typeof import('@aws-sdk/client-s3')
let s3SdkPromise: Promise<S3Sdk> | null = null

function loadS3Sdk(): Promise<S3Sdk> {
  if (!s3SdkPromise) {
    s3SdkPromise = import('@aws-sdk/client-s3').catch((error) => {
      // 失败不缓存, 允许下次调用重试
      s3SdkPromise = null
      throw error
    })
  }
  return s3SdkPromise
}

const logger = loggerService.withContext('S3Storage')

/**
 * 将可读流转换为 Buffer
 */
function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

// 需要使用 Virtual Host-Style 的服务商域名后缀白名单
const VIRTUAL_HOST_SUFFIXES = ['aliyuncs.com', 'myqcloud.com', 'volces.com']

/**
 * 使用 AWS SDK v3 的简单 S3 封装，兼容之前 RemoteStorage 的最常用接口。
 * SDK 模块在首次实际使用（构造客户端）时才动态加载。
 */
export default class S3Storage {
  private bucket: string
  private root: string
  private usePathStyle: boolean
  private config: S3Config
  private clientPromise: Promise<S3ClientType> | null = null

  constructor(config: S3Config) {
    this.config = config
    this.bucket = config.bucket
    this.root = config.root?.replace(/^\/+/g, '').replace(/\/+$/g, '') || ''
    this.usePathStyle = S3Storage.resolveUsePathStyle(config.endpoint)

    this.putFileContents = this.putFileContents.bind(this)
    this.getFileContents = this.getFileContents.bind(this)
    this.deleteFile = this.deleteFile.bind(this)
    this.listFiles = this.listFiles.bind(this)
    this.checkConnection = this.checkConnection.bind(this)
  }

  private static resolveUsePathStyle(endpoint?: string): boolean {
    if (!endpoint) return false

    try {
      const { hostname } = new URL(endpoint)

      if (hostname === 'localhost' || net.isIP(hostname) !== 0) {
        return true
      }

      const isInWhiteList = VIRTUAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
      return !isInWhiteList
    } catch (e) {
      logger.warn(`[S3Storage] Failed to parse endpoint, fallback to Path-Style: ${endpoint}`, e as Error)
      return true
    }
  }

  /** 首次调用时才 import SDK 并创建 client（单例缓存；失败则清除缓存以便下次重试） */
  private async getClient(): Promise<S3ClientType> {
    if (!this.clientPromise) {
      const promise = loadS3Sdk()
        .then(({ S3Client }) => {
          const { endpoint, region, accessKeyId, secretAccessKey } = this.config
          return new S3Client({
            region,
            endpoint: endpoint || undefined,
            credentials: {
              accessKeyId,
              secretAccessKey
            },
            forcePathStyle: this.usePathStyle
          })
        })
        .catch((error) => {
          // 不缓存 rejected promise：网络/配置恢复后允许下次调用重新初始化
          if (this.clientPromise === promise) this.clientPromise = null
          throw error
        })
      this.clientPromise = promise
    }
    return this.clientPromise
  }

  /**
   * 内部辅助方法，用来拼接带 root 的对象 key
   */
  private buildKey(key: string): string {
    if (!this.root) return key
    return key.startsWith(`${this.root}/`) ? key : `${this.root}/${key}`
  }

  async putFileContents(key: string, data: Buffer | string) {
    try {
      const contentType = key.endsWith('.zip') ? 'application/zip' : 'application/octet-stream'

      return await (await this.getClient()).send(
        new (await loadS3Sdk()).PutObjectCommand({
          Bucket: this.bucket,
          Key: this.buildKey(key),
          Body: data,
          ContentType: contentType
        })
      )
    } catch (error) {
      logger.error('[S3Storage] Error putting object:', error as Error)
      throw error
    }
  }

  async getFileContents(key: string): Promise<Buffer> {
    try {
      const res = await (await this.getClient()).send(
        new (await loadS3Sdk()).GetObjectCommand({ Bucket: this.bucket, Key: this.buildKey(key) })
      )
      if (!res.Body || !(res.Body instanceof Readable)) {
        throw new Error('Empty body received from S3')
      }
      return await streamToBuffer(res.Body as Readable)
    } catch (error) {
      logger.error('[S3Storage] Error getting object:', error as Error)
      throw error
    }
  }

  async deleteFile(key: string) {
    try {
      const keyWithRoot = this.buildKey(key)
      const variations = new Set([keyWithRoot, key.replace(/^\//, '')])
      for (const k of variations) {
        try {
          await (await this.getClient()).send(
            new (await loadS3Sdk()).DeleteObjectCommand({ Bucket: this.bucket, Key: k })
          )
        } catch {
          // 忽略删除失败
        }
      }
    } catch (error) {
      logger.error('[S3Storage] Error deleting object:', error as Error)
      throw error
    }
  }

  /**
   * 列举指定前缀下的对象，默认列举全部。
   */
  async listFiles(prefix = ''): Promise<Array<{ key: string; lastModified?: string; size: number }>> {
    const files: Array<{ key: string; lastModified?: string; size: number }> = []
    let continuationToken: string | undefined
    const fullPrefix = this.buildKey(prefix)

    try {
      do {
        const res = await (await this.getClient()).send(
          new (await loadS3Sdk()).ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: fullPrefix === '' ? undefined : fullPrefix,
            ContinuationToken: continuationToken
          })
        )

        res.Contents?.forEach((obj) => {
          if (!obj.Key) return
          files.push({
            key: obj.Key,
            lastModified: obj.LastModified?.toISOString(),
            size: obj.Size ?? 0
          })
        })

        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
      } while (continuationToken)

      return files
    } catch (error) {
      logger.error('[S3Storage] Error listing objects:', error as Error)
      throw error
    }
  }

  /**
   * 尝试调用 HeadBucket 判断凭证/网络是否可用
   */
  async checkConnection() {
    try {
      await (await this.getClient()).send(new (await loadS3Sdk()).HeadBucketCommand({ Bucket: this.bucket }))
      return true
    } catch (error) {
      logger.error('[S3Storage] Error checking connection:', error as Error)
      throw error
    }
  }
}
