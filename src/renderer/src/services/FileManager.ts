import { loggerService } from '@logger'
import db from '@renderer/databases'
import store from '@renderer/store'
import type { FileMetadata } from '@renderer/types'
import { getFileDirectory } from '@renderer/utils'
import dayjs from 'dayjs'

const logger = loggerService.withContext('FileManager')

class FileManager {
  static async selectFiles(options?: Electron.OpenDialogOptions): Promise<FileMetadata[] | null> {
    return await window.api.file.select(options)
  }

  static async addFile(file: FileMetadata): Promise<FileMetadata> {
    // Atomic get+increment: two windows adding the same file concurrently
    // must not both read the same count and lose an increment (which would
    // cause premature physical deletion of a still-referenced file).
    return await db.transaction('rw', db.files, async () => {
      const existing = await db.files.get(file.id)
      if (existing) {
        await db.files.update(existing.id, { ...existing, count: existing.count + 1 })
        return existing
      }
      await db.files.add(file)
      return file
    })
  }

  static async addFiles(files: FileMetadata[]): Promise<FileMetadata[]> {
    return Promise.all(files.map((file) => this.addFile(file)))
  }

  static async readBinaryImage(file: FileMetadata): Promise<Buffer> {
    const fileData = await window.api.file.binaryImage(file.id + file.ext)
    return fileData.data
  }

  static async readBase64File(file: FileMetadata): Promise<string> {
    const fileData = await window.api.file.base64File(file.id + file.ext)
    return fileData.data
  }

  static async addBase64File(file: FileMetadata): Promise<FileMetadata> {
    logger.info(`Adding base64 file: ${JSON.stringify(file)}`)

    const base64File = await window.api.file.base64File(file.id + file.ext)
    // Atomic get+increment (see addFile)
    return await db.transaction('rw', db.files, async () => {
      const existing = await db.files.get(base64File.id)
      if (existing) {
        await db.files.update(existing.id, { ...existing, count: existing.count + 1 })
        return existing
      }
      await db.files.add(base64File)
      return base64File
    })
  }

  static async uploadFile(file: FileMetadata): Promise<FileMetadata> {
    logger.info(`Uploading file: ${JSON.stringify(file)}`)

    const uploadFile = await window.api.file.upload(file)
    logger.info('Uploaded file:', uploadFile)
    // Atomic get+increment (see addFile)
    return await db.transaction('rw', db.files, async () => {
      const existing = await db.files.get(uploadFile.id)
      if (existing) {
        await db.files.update(existing.id, { ...existing, count: existing.count + 1 })
        return existing
      }
      await db.files.add(uploadFile)
      return uploadFile
    })
  }

  static async uploadFiles(files: FileMetadata[]): Promise<FileMetadata[]> {
    return Promise.all(files.map((file) => this.uploadFile(file)))
  }

  static async getFile(id: string): Promise<FileMetadata | undefined> {
    const file = await db.files.get(id)

    if (file) {
      const filesPath = store.getState().runtime.filesPath
      // filesPath 未初始化（如 mini 窗口初始化完成前）时保持 db 中已存的绝对路径，
      // 避免覆盖成 file:///<id><ext> 这类无效路径
      if (filesPath) {
        file.path = filesPath + '/' + file.id + file.ext
      }
    }

    return file
  }

  static getFilePath(file: FileMetadata) {
    const filesPath = store.getState().runtime.filesPath
    // filesPath 未初始化（如 mini 窗口）时回退到元数据里的磁盘绝对路径，
    // 保证 file:// 前缀后一定指向真实存在的文件
    return filesPath ? filesPath + '/' + file.id + file.ext : file.path
  }

  static async deleteFile(id: string, force: boolean = false): Promise<void> {
    // Atomic read-modify-write: two concurrent deletions of the same file
    // must not both read count and each write count-1 (leaking the record).
    const file = await db.transaction('rw', db.files, async () => {
      const current = await db.files.get(id)
      if (!current) {
        return undefined
      }
      if (!force && current.count > 1) {
        await db.files.update(id, { ...current, count: current.count - 1 })
        return undefined
      }
      await db.files.delete(id)
      return current
    })

    if (!file) {
      return
    }

    try {
      await window.api.file.delete(id + file.ext)
    } catch (error) {
      logger.error('Failed to delete file:', error as Error)
    }
  }

  static async deleteFiles(files: FileMetadata[]): Promise<void> {
    if (!files || files.length === 0) return

    const results = await Promise.allSettled(files.map((file) => this.deleteFile(file.id)))

    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      logger.warn(`File deletions completed with ${failed.length} files failed to delete:`, failed)
    }
  }

  static async allFiles(): Promise<FileMetadata[]> {
    return db.files.toArray()
  }

  static isDangerFile(file: FileMetadata) {
    return ['.sh', '.bat', '.cmd', '.ps1', '.vbs', 'reg'].includes(file.ext)
  }

  static getSafePath(file: FileMetadata) {
    // use the path from the file metadata instead
    // this function is used to get path for files which are not in the filestorage
    return this.isDangerFile(file) ? getFileDirectory(file.path) : file.path
  }

  static getFileUrl(file: FileMetadata) {
    const filesPath = store.getState().runtime.filesPath
    // filesPath 未初始化（如 mini 窗口）时回退到元数据里的磁盘绝对路径
    return 'file://' + (filesPath ? filesPath + '/' + file.name : file.path)
  }

  static async updateFile(file: FileMetadata) {
    if (!file.origin_name.includes(file.ext)) {
      file.origin_name = file.origin_name + file.ext
    }

    await db.files.update(file.id, file)
  }

  static formatFileName(file: FileMetadata) {
    if (!file || !file.origin_name) {
      return ''
    }

    const date = dayjs(file.created_at).format('YYYY-MM-DD')

    if (file.origin_name.includes('pasted_text')) {
      return date + ' ' + '剪切板文件' + file.ext
    }

    if (file.origin_name.startsWith('temp_file') && file.origin_name.includes('image')) {
      return date + ' ' + '剪切板图片' + file.ext
    }

    return file.origin_name
  }
}

export default FileManager
