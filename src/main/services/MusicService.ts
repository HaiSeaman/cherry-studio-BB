import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { app, type IpcMainInvokeEvent, nativeImage } from 'electron'
import { parseStream } from 'music-metadata'

const logger = loggerService.withContext('MusicService')

/** 本地音乐支持的音频扩展名（与源项目一致） */
export const MUSIC_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.weba', '.webm']

const MAX_SCAN_FILES = 2000
const MAX_SCAN_DEPTH = 10
const MAX_COVER_BYTES = 5 * 1024 * 1024
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp']

export type MusicMetadata = {
  title: string
  artist: string
  album: string
  duration: number
  coverPath: string
  thumbPath: string
}

export type MusicMetadataResponse = { success: true; metadata: MusicMetadata } | { success: false; error: string }
export type MusicScanResponse = { success: boolean; files: { filePath: string; size: number }[]; truncated: boolean }
export type MusicThumbsResponse = { success: boolean; generated: number }
export type MusicAudioFileResponse = { success: true; data: Uint8Array } | { success: false; error: string }

/** 自定义闹钟声音允许的扩展名与大小上限（MP3 等解码需要完整文件） */
const CUSTOM_SOUND_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
const CUSTOM_SOUND_MAX_BYTES = 20 * 1024 * 1024

/**
 * 音乐 TAB 主进程服务：
 * - readMetadata：music-metadata 流式解析 + 封面提取（sha256 命名）+ 96×96 缩略图
 * - scanFolder：递归扫描（≤2000 文件 / 深度 ≤10 / 扩展名白名单）
 * - ensureThumbs：为缺缩略图的封面补齐
 * 数据目录：userData/music/covers（原图）与 covers/thumb（缩略图）
 */
export class MusicService {
  private getCoversDir(): string {
    return path.join(app.getPath('userData'), 'music', 'covers')
  }

  private async ensureCoversDir(): Promise<string> {
    const dir = this.getCoversDir()
    await fs.promises.mkdir(path.join(dir, 'thumb'), { recursive: true })
    return dir
  }

  public readMetadata = async (
    _: IpcMainInvokeEvent,
    { filePath }: { filePath: string }
  ): Promise<MusicMetadataResponse> => {
    try {
      if (!path.isAbsolute(filePath)) throw new Error('path must be absolute')
      const ext = path.extname(filePath).toLowerCase()
      if (!MUSIC_AUDIO_EXTENSIONS.includes(ext)) throw new Error(`unsupported audio extension: ${ext}`)

      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) throw new Error('not a file')

      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      let parsed
      try {
        parsed = await parseStream(stream)
      } finally {
        stream.destroy()
      }

      const common = parsed.common ?? {}
      const metadata: MusicMetadata = {
        title: common.title || path.basename(filePath, ext),
        artist: common.artist || '',
        album: common.album || '',
        duration: Math.round(parsed.format?.duration ?? 0),
        coverPath: '',
        thumbPath: ''
      }

      const pic = common.picture?.[0]
      if (pic && Buffer.isBuffer(pic.data) && pic.data.length > 0 && pic.data.length <= MAX_COVER_BYTES) {
        const { coverPath, thumbPath } = await this.extractCover(pic.data, pic.format)
        metadata.coverPath = coverPath
        metadata.thumbPath = thumbPath
      }
      return { success: true, metadata }
    } catch (err) {
      logger.error('readMetadata failed', err instanceof Error ? err : new Error(String(err)))
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  public scanFolder = async (
    _: IpcMainInvokeEvent,
    { folderPath, recursive = true }: { folderPath: string; recursive?: boolean }
  ): Promise<MusicScanResponse> => {
    try {
      if (!path.isAbsolute(folderPath)) throw new Error('path must be absolute')
      const stat = await fs.promises.stat(folderPath)
      if (!stat.isDirectory()) throw new Error('not a directory')

      const files: { filePath: string; size: number }[] = []
      let truncated = false

      const walk = async (dir: string, depth: number): Promise<void> => {
        if (files.length >= MAX_SCAN_FILES) {
          truncated = true
          return
        }
        let entries: fs.Dirent[]
        try {
          entries = await fs.promises.readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          if (files.length >= MAX_SCAN_FILES) {
            truncated = true
            return
          }
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            if (recursive && depth < MAX_SCAN_DEPTH && !entry.name.startsWith('.')) {
              await walk(full, depth + 1)
            }
          } else if (entry.isFile()) {
            if (!MUSIC_AUDIO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue
            try {
              const st = await fs.promises.stat(full)
              if (st.isFile()) files.push({ filePath: full, size: st.size })
            } catch {
              // 单文件 stat 失败跳过
            }
          }
        }
      }

      await walk(folderPath, 0)
      return { success: true, files, truncated }
    } catch (err) {
      logger.error('scanFolder failed', err instanceof Error ? err : new Error(String(err)))
      return { success: false, files: [], truncated: false }
    }
  }

  /** 读取自定义闹钟声音文件（二进制，≤20MB，扩展名白名单） */
  public readAudioFile = async (
    _: IpcMainInvokeEvent,
    { filePath }: { filePath: string }
  ): Promise<MusicAudioFileResponse> => {
    try {
      if (!path.isAbsolute(filePath)) throw new Error('path must be absolute')
      if (!CUSTOM_SOUND_EXTS.includes(path.extname(filePath).toLowerCase()))
        throw new Error('unsupported audio extension')
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) throw new Error('not a file')
      if (stat.size > CUSTOM_SOUND_MAX_BYTES) throw new Error('file too large (max 20MB)')
      const buf = await fs.promises.readFile(filePath)
      return { success: true, data: new Uint8Array(buf) }
    } catch (err) {
      logger.error('readAudioFile failed', err instanceof Error ? err : new Error(String(err)))
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  public ensureThumbs = async (): Promise<MusicThumbsResponse> => {
    try {
      const coversDir = await this.ensureCoversDir()
      const thumbDir = path.join(coversDir, 'thumb')
      const entries = await fs.promises.readdir(coversDir, { withFileTypes: true })
      let generated = 0
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const ext = path.extname(entry.name).toLowerCase()
        if (!IMAGE_EXTS.includes(ext)) continue
        const thumbPath = path.join(thumbDir, `${path.basename(entry.name, ext)}.jpg`)
        try {
          await fs.promises.access(thumbPath)
          continue
        } catch {
          // 缺缩略图，生成
        }
        try {
          const img = nativeImage.createFromBuffer(await fs.promises.readFile(path.join(coversDir, entry.name)))
          if (img.isEmpty()) continue
          await fs.promises.writeFile(thumbPath, img.resize({ width: 96, height: 96, quality: 'good' }).toJPEG(85))
          generated += 1
        } catch {
          // 单图失败跳过
        }
      }
      return { success: true, generated }
    } catch (err) {
      logger.error('ensureThumbs failed', err instanceof Error ? err : new Error(String(err)))
      return { success: false, generated: 0 }
    }
  }

  /** 封面提取：sha256 前 32 位命名存原图，nativeImage 生成 96×96 JPEG85 缩略图 */
  private async extractCover(data: Buffer, format?: string): Promise<{ coverPath: string; thumbPath: string }> {
    const coversDir = await this.ensureCoversDir()
    const coverExt = format === 'image/png' ? '.png' : format === 'image/webp' ? '.webp' : '.jpg'
    const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 32)
    const coverPath = path.join(coversDir, hash + coverExt)
    try {
      await fs.promises.access(coverPath)
    } catch {
      await fs.promises.writeFile(coverPath, data)
    }
    const thumbPath = path.join(coversDir, 'thumb', `${hash}.jpg`)
    try {
      await fs.promises.access(thumbPath)
    } catch {
      const img = nativeImage.createFromBuffer(data)
      if (!img.isEmpty()) {
        await fs.promises.writeFile(thumbPath, img.resize({ width: 96, height: 96, quality: 'good' }).toJPEG(85))
      } else {
        return { coverPath, thumbPath: '' }
      }
    }
    return { coverPath, thumbPath }
  }
}

export const musicService = new MusicService()
