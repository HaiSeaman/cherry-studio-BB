import WebDav from './WebDav'
import S3Storage from './S3Storage'
import type { S3Config, WebDavConfig } from '../../renderer/src/types'

export type SyncChannel = 's3' | 'webdav'

/**
 * 跨设备同步专用文件通道：包装 S3Storage / WebDav 的通用 put/get/delete。
 * 独立模块，不 import 不修改 BackupManager。
 * 目录约定：cherry-rk-sync/（与手机端一致）
 */
export class CherrySyncStorage {
  async putFile(
    channel: SyncChannel,
    config: Record<string, unknown>,
    key: string,
    content: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      if (channel === 'webdav') {
        const client = new WebDav(config as unknown as WebDavConfig)
        const err = await client.putFileContents(key, content)
        if (err) return { ok: false, error: String(err) }
      } else {
        const client = new S3Storage(config as unknown as S3Config)
        await client.putFileContents(key, content)
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async getFile(
    channel: SyncChannel,
    config: Record<string, unknown>,
    key: string
  ): Promise<{ ok: boolean; data?: string; error?: string }> {
    try {
      let buf: Buffer
      if (channel === 'webdav') {
        const client = new WebDav(config as unknown as WebDavConfig)
        buf = Buffer.from((await client.getFileContents(key)) as Buffer)
      } else {
        const client = new S3Storage(config as unknown as S3Config)
        buf = Buffer.from(await client.getFileContents(key))
      }
      return { ok: true, data: buf.toString('utf8') }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async deleteFile(
    channel: SyncChannel,
    config: Record<string, unknown>,
    key: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      if (channel === 'webdav') {
        const client = new WebDav(config as unknown as WebDavConfig)
        await client.deleteFile(key)
      } else {
        const client = new S3Storage(config as unknown as S3Config)
        await client.deleteFile(key)
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
}

export const syncStorage = new CherrySyncStorage()