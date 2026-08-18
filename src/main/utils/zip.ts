import util from 'node:util'
import zlib from 'node:zlib'

import { loggerService } from '@logger'

const logger = loggerService.withContext('Utils:Zip')

// 将 zlib 的 gunzip 方法转换为 Promise 版本
const gunzipPromise = util.promisify(zlib.gunzip)

/**
 * 解压缩 Buffer 到 JSON 字符串
 * @param {Buffer} compressedBuffer - 压缩的 Buffer
 * @returns {Promise<string>} 解压缩后的 JSON 字符串
 */
export async function decompress(compressedBuffer: Buffer): Promise<string> {
  try {
    const buffer = await gunzipPromise(compressedBuffer)
    return buffer.toString('utf-8')
  } catch (error) {
    logger.error('Decompression failed:', error as Error)
    throw error
  }
}
