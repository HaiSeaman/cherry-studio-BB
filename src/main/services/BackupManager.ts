import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'

import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'
import type { WebDavConfig } from '@types'
import type { S3Config } from '@types'
import archiver from 'archiver'
import { app } from 'electron'
import StreamZip from 'node-stream-zip'
import * as path from 'path'
import type { CreateDirectoryOptions, FileStat } from 'webdav'

import { getDataPath } from '../utils'
import { isPathInside, resolveAndValidatePath, validateZipEntries } from '../utils/file'
import S3Storage from './S3Storage'
import selectionService from './SelectionService'
import WebDav from './WebDav'
import { windowService } from './WindowService'

const logger = loggerService.withContext('BackupManager')

/**
 * 判断路径是否存在（等价于 fs-extra 的 pathExists）
 */
async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

/**
 * 递归创建目录（等价于 fs-extra 的 ensureDir）
 */
async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true })
}

/**
 * 递归删除文件或目录，路径不存在时不报错（等价于 fs-extra 的 remove）
 */
async function removePath(target: string): Promise<void> {
  await fsp.rm(target, { recursive: true, force: true })
}

/**
 * 递归复制文件或目录（等价于 fs-extra 的 copy）
 */
async function copyPath(source: string, dest: string, options: fs.CopyOptions = {}): Promise<void> {
  await fsp.cp(source, dest, { recursive: true, ...options })
}

interface CopyDirOptions {
  dereferenceSymlinks: boolean
  sourceRootRealPath?: string
}

interface EffectiveEntryStats {
  isSymlink: boolean
  stats: fs.Stats
}

interface ProgressData {
  stage: string
  progress: number
  total: number
}

class BackupManager {
  private tempDir = path.join(app.getPath('temp'), 'cherry-studio', 'backup', 'temp')
  private backupDir = path.join(app.getPath('temp'), 'cherry-studio', 'backup')

  // Cached instance to avoid recreating
  private s3Storage: S3Storage | null = null
  private webdavInstance: WebDav | null = null

  // Cached core connection config, used to detect if connection config has changed
  private cachedS3ConnectionConfig: {
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    root?: string
  } | null = null

  private cachedWebdavConnectionConfig: {
    webdavHost: string
    webdavUser?: string
    webdavPass?: string
    webdavPath?: string
  } | null = null

  /**
   * Handle backup restoration on app startup
   * Called after window is created but before renderer is loaded
   */
  static async handleStartupRestore(): Promise<void> {
    const userDataPath = app.getPath('userData')

    // Define restore paths
    const indexedDBRestore = path.join(userDataPath, 'IndexedDB.restore')
    const localStorageRestore = path.join(userDataPath, 'Local Storage.restore')
    const dataRestore = getDataPath() + '.restore'

    // Define target paths
    const indexedDBDest = path.join(userDataPath, 'IndexedDB')
    const localStorageDest = path.join(userDataPath, 'Local Storage')
    const dataDest = getDataPath()

    try {
      // Check if any restore markers exist
      const hasIndexedDBRestore = await pathExists(indexedDBRestore)
      const hasLocalStorageRestore = await pathExists(localStorageRestore)
      const hasDataRestore = await pathExists(dataRestore)

      if (!hasIndexedDBRestore && !hasLocalStorageRestore && !hasDataRestore) {
        return
      }

      // Restore IndexedDB
      if (hasIndexedDBRestore) {
        logger.info('[handleStartupRestore] Found IndexedDB.restore directories, completing restoration...')
        await removePath(indexedDBDest).catch(() => {})
        await fsp.rename(indexedDBRestore, indexedDBDest)
      }

      // Restore Local Storage
      if (hasLocalStorageRestore) {
        logger.info('[handleStartupRestore] Found Local Storage.restore directories, completing restoration...')
        await removePath(localStorageDest).catch(() => {})
        await fsp.rename(localStorageRestore, localStorageDest)
      }

      // Restore Data
      if (hasDataRestore) {
        logger.info('[handleStartupRestore] Found Local Data.restore directories, completing restoration...')
        await removePath(dataDest).catch(() => {})
        await fsp.rename(dataRestore, dataDest)
      }

      logger.info('[handleStartupRestore] Restoration completed successfully')
    } catch (error) {
      logger.error('[handleStartupRestore] Failed to complete restoration:', error as Error)
      // Clean up restore markers to avoid endless retry loop
      await removePath(indexedDBRestore).catch(() => {})
      await removePath(localStorageRestore).catch(() => {})
      await removePath(dataRestore).catch(() => {})
    }
  }

  /**
   * Backup metadata for direct backup format (version 6+)
   */
  private createDirectBackupMetadata(): {
    version: number
    timestamp: number
    appName: string
    appVersion: string
    platform: string
    arch: string
  } {
    return {
      version: 6,
      timestamp: Date.now(),
      appName: 'Cherry-Studio-BB',
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch
    }
  }

  /**
   * Direct backup method - copies IndexedDB and Local Storage directories directly.
   * No JSON serialization, better performance for large databases.
   * @param _ - Electron IPC event
   * @param fileName - Name of the backup file
   * @param destinationPath - Path to save the backup (defaults to this.backupDir)
   * @param skipBackupFile - Whether to skip backing up the Data directory
   * @returns Path to the created backup file
   */
  async backup(
    _: Electron.IpcMainInvokeEvent,
    fileName: string,
    destinationPath: string = this.backupDir,
    skipBackupFile: boolean = false
  ): Promise<string> {
    const onProgress = this.onProgress(IpcChannel.BackupProgress, true)

    try {
      await ensureDir(this.tempDir)
      onProgress({ stage: 'preparing', progress: 0, total: 100 })

      const userDataPath = app.getPath('userData')
      let currentProgress = 10

      // Step 2: Copy IndexedDB and Local Storage directories
      onProgress({ stage: 'copying_database', progress: 15, total: 100 })
      logger.debug('[backupDirect] Copying database directories...')

      const indexedDBSource = path.join(userDataPath, 'IndexedDB')
      const indexedDBDest = path.join(this.tempDir, 'IndexedDB')
      if (await pathExists(indexedDBSource)) {
        await copyPath(indexedDBSource, indexedDBDest)
      } else {
        logger.debug('[backupDirect] IndexedDB directory not found, skipping')
      }

      const localStorageSource = path.join(userDataPath, 'Local Storage')
      const localStorageDest = path.join(this.tempDir, 'Local Storage')
      if (await pathExists(localStorageSource)) {
        await copyPath(localStorageSource, localStorageDest)
      } else {
        logger.debug('[backupDirect] Local Storage directory not found, skipping')
      }

      currentProgress = 50
      onProgress({ stage: 'copying_database', progress: currentProgress, total: 100 })

      // Step 3: Write metadata.json
      const metadata = this.createDirectBackupMetadata()
      await fsp.writeFile(path.join(this.tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2))
      onProgress({ stage: 'copying_database', progress: 52, total: 100 })

      // Step 4: Copy Data directory (if not skipped)
      if (!skipBackupFile) {
        const sourcePath = path.join(userDataPath, 'Data')
        const tempDataDir = path.join(this.tempDir, 'Data')

        if (await pathExists(sourcePath)) {
          const totalSize = await this.getDirSize(sourcePath, { dereferenceSymlinks: true })

          await this.copyDirWithProgress(
            sourcePath,
            tempDataDir,
            this.createCopyProgressHandler(totalSize, 52, 80, 'copying_files', onProgress),
            { dereferenceSymlinks: true }
          )
        }
      } else {
        logger.debug('[backupDirect] Skip the backup of the file')
        await fsp.mkdir(path.join(this.tempDir, 'Data'))
      }
      onProgress({ stage: 'compressing', progress: 80, total: 100 })

      // Step 5: Create ZIP archive
      // Strip directory components from fileName so a renderer-supplied name
      // like "../evil.zip" cannot escape destinationPath.
      const safeFileName = path.basename(fileName)
      const backupedFilePath = path.join(destinationPath, safeFileName)
      const output = fs.createWriteStream(backupedFilePath)
      const archive = archiver('zip', {
        zlib: { level: 1 }, // Use lowest compression level for speed (same as legacy backup)
        zip64: true
      })

      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve())
        archive.on('error', reject)
        archive.on('warning', (err: any) => {
          if (err.code !== 'ENOENT') {
            logger.warn('[backupDirect] Archive warning:', err)
          }
        })
        archive.pipe(output)
        archive.directory(this.tempDir, false)
        archive.finalize()
      })

      // Clean up temp directory
      await removePath(this.tempDir)
      onProgress({ stage: 'completed', progress: 100, total: 100 })

      logger.info('[backupDirect] Backup completed successfully')
      return backupedFilePath
    } catch (error) {
      logger.error('[backupDirect] Backup failed:', error as Error)
      await removePath(this.tempDir).catch(() => {})

      throw error
    }
  }

  /**
   * Direct backup to local directory
   * Creates a backup and saves it to a local directory.
   * @param _ - Electron IPC event
   * @param fileName - Name of the backup file
   * @param localConfig - Local backup configuration (directory path and options)
   * @returns Path to the created backup file
   */
  async backupToLocalDir(
    _: Electron.IpcMainInvokeEvent,
    fileName: string,
    localConfig: { localBackupDir?: string; skipBackupFile?: boolean }
  ) {
    try {
      const backupDir = localConfig.localBackupDir || this.backupDir
      await ensureDir(backupDir)
      return await this.backup(_, fileName, backupDir, localConfig.skipBackupFile)
    } catch (error) {
      logger.error('[backupToLocalDir] Local backup failed:', error as Error)
      throw error
    }
  }

  /**
   * Direct backup to WebDAV
   * Creates a backup and uploads it to a WebDAV server.
   * @param _ - Electron IPC event
   * @param webdavConfig - WebDAV configuration including server URL, credentials, and options
   * @returns Result from WebDAV upload operation
   */
  async backupToWebdav(_: Electron.IpcMainInvokeEvent, webdavConfig: WebDavConfig) {
    const filename = webdavConfig.fileName || 'cherry-studio.backup.zip'
    const backupedFilePath = await this.backup(_, filename, undefined, webdavConfig.skipBackupFile)
    const webdavClient = this.getWebDavInstance(webdavConfig)
    try {
      let result
      if (webdavConfig.disableStream) {
        const fileContent = await fsp.readFile(backupedFilePath)
        result = await webdavClient.putFileContents(filename, fileContent, { overwrite: true })
      } else {
        const contentLength = (await fsp.stat(backupedFilePath)).size
        result = await webdavClient.putFileContents(filename, fs.createReadStream(backupedFilePath), {
          overwrite: true,
          contentLength
        })
      }
      await removePath(backupedFilePath)
      return result
    } catch (error) {
      await removePath(backupedFilePath).catch(() => {})
      throw error
    }
  }

  /**
   * Direct backup to S3
   * Creates a backup and uploads it to an S3-compatible storage.
   * @param _ - Electron IPC event
   * @param s3Config - S3 configuration including endpoint, bucket, credentials, and options
   * @returns Result from S3 upload operation
   */
  async backupToS3(_: Electron.IpcMainInvokeEvent, s3Config: S3Config) {
    const os = require('os')
    const deviceName = os.hostname ? os.hostname() : 'device'
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14)
    const filename = s3Config.fileName || `cherry-studio.backup.${deviceName}.${timestamp}.zip`

    logger.debug(`[backupToS3] Starting S3 backup to ${filename}`)

    const backupedFilePath = await this.backup(_, filename, undefined, s3Config.skipBackupFile)
    const s3Client = this.getS3Storage(s3Config)
    try {
      const fileBuffer = await fsp.readFile(backupedFilePath)
      const result = await s3Client.putFileContents(filename, fileBuffer)
      await removePath(backupedFilePath)
      logger.info(`S3 backup completed: ${filename}`)
      return result
    } catch (error) {
      logger.error('[backupToS3] S3 backup failed:', error as Error)
      await removePath(backupedFilePath)
      throw error
    }
  }

  /**
   * Restore from a backup file
   * Automatically detects backup format (direct v6+ or legacy) and restores accordingly.
   * For direct backup: replaces IndexedDB and Local Storage directories, then relaunches app.
   * For legacy backup: restores data from data.json and Data directory.
   * @param _ - Electron IPC event
   * @param backupPath - Path to the backup ZIP file
   * @returns For legacy backup: the data string from data.json. For direct backup: void (app will relaunch)
   */
  async restore(_: Electron.IpcMainInvokeEvent, backupPath: string): Promise<string | void> {
    const onProgress = this.onProgress(IpcChannel.RestoreProgress, true)

    try {
      // Create temp directory
      await ensureDir(this.tempDir)
      onProgress({ stage: 'preparing', progress: 0, total: 100 })

      logger.debug(`step 1: unzip backup file: ${this.tempDir}`)

      const zip = new StreamZip.async({ file: backupPath })
      try {
        // Reject archives with path traversal entries (zip-slip) or excessive
        // uncompressed size before anything is written to disk.
        await validateZipEntries(zip)
        onProgress({ stage: 'extracting', progress: 15, total: 100 })
        await zip.extract(null, this.tempDir)
      } finally {
        await zip.close().catch(() => {})
      }
      onProgress({ stage: 'extracted', progress: 20, total: 100 })

      // Check for backup type: direct (version 6+) or legacy (version <= 5)
      const metadataPath = path.join(this.tempDir, 'metadata.json')
      const isDirectBackup = await pathExists(metadataPath)

      if (isDirectBackup) {
        // Direct backup format (version 6+)
        logger.debug('Detected direct backup format (version 6+)')
        // Note: tempDir is NOT cleaned up here - restoreDirect will use and clean it
        await this.restoreDirect()
        // Direct restore doesn't return data - app needs to relaunch
        return
      }

      // Legacy backup format (version <= 5)
      logger.debug('Detected legacy backup format (version <= 5)')

      const data = await this.restoreLegacy()

      return data
    } catch (error) {
      logger.error('Restore failed:', error as Error)
      await removePath(this.tempDir).catch(() => {})
      throw error
    }
  }

  /**
   * Restore from direct backup format (version 6+).
   * Writes to `*.restore` directories; `handleStartupRestore` performs the atomic
   * swap on next launch, before any DB connection or window opens. Avoids
   * overwriting live IndexedDB / libsql files (issue #14774).
   */
  private async restoreDirect(): Promise<void> {
    const onProgress = this.onProgress(IpcChannel.RestoreProgress, true)

    const userDataPath = app.getPath('userData')
    const indexedDBDest = path.join(userDataPath, 'IndexedDB.restore')
    const localStorageDest = path.join(userDataPath, 'Local Storage.restore')
    const dataDest = path.join(userDataPath, 'Data.restore')

    try {
      // Read and validate metadata
      const metadataPath = path.join(this.tempDir, 'metadata.json')
      const metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf-8'))

      // Validate appName to ensure backup is from Cherry Studio（兼容旧版备份名）
      if (metadata.appName !== 'Cherry Studio' && metadata.appName !== 'Cherry-Studio-BB') {
        throw new Error('This backup file is not from Cherry Studio and cannot be restored')
      }

      // Warn about cross-platform restore
      if (metadata.platform && metadata.platform !== process.platform) {
        logger.warn(
          `[restoreDirect] Cross-platform restore: backup from ${metadata.platform}, current is ${process.platform}`
        )
      }

      onProgress({ stage: 'validating', progress: 25, total: 100 })

      onProgress({ stage: 'restoring_database', progress: 30, total: 100 })

      // IndexedDB & Local Storage Path
      const indexedDBSource = path.join(this.tempDir, 'IndexedDB')
      const localStorageSource = path.join(this.tempDir, 'Local Storage')

      logger.debug('[restoreDirect] Staging database directories...')

      if (await pathExists(indexedDBSource)) {
        await removePath(indexedDBDest).catch(() => {})
        await copyPath(indexedDBSource, indexedDBDest)
      }

      if (await pathExists(localStorageSource)) {
        await removePath(localStorageDest).catch(() => {})
        await copyPath(localStorageSource, localStorageDest)
      }

      onProgress({ stage: 'restoring_database', progress: 65, total: 100 })

      //  Restore Data directory
      const dataSource = path.join(this.tempDir, 'Data')
      const dataExists = await pathExists(dataSource)
      const dataFiles = dataExists ? await fsp.readdir(dataSource) : []

      if (dataExists && dataFiles.length > 0) {
        logger.debug('[restoreDirect] Staging Data directory...')

        const totalSize = await this.getDirSize(dataSource, { dereferenceSymlinks: false })

        await removePath(dataDest).catch(() => {})

        await this.copyDirWithProgress(
          dataSource,
          dataDest,
          this.createCopyProgressHandler(totalSize, 65, 95, 'restoring_data', onProgress),
          { dereferenceSymlinks: false }
        )
      } else {
        logger.debug('[restoreDirect] No Data directory to restore')
      }

      // Clean up
      await removePath(this.tempDir)
      onProgress({ stage: 'completed', progress: 100, total: 100 })

      logger.info('[restoreDirect] Restore staged successfully, relaunching app to apply...')

      selectionService?.quit()
      app.relaunch()
      app.exit(0)
    } catch (error) {
      logger.error('[restoreDirect] Restore failed:', error as Error)
      await Promise.all([
        removePath(this.tempDir).catch(() => {}),
        removePath(indexedDBDest).catch(() => {}),
        removePath(localStorageDest).catch(() => {}),
        removePath(dataDest).catch(() => {})
      ])
      throw error
    }
  }

  /**
   * Restore from legacy backup format (version <= 5)
   * Restores data from data.json and Data directory.
   * @param onProgress - Callback function to report restore progress
   * @returns The data string read from data.json
   */
  private async restoreLegacy(): Promise<string> {
    const onProgress = this.onProgress(IpcChannel.RestoreProgress, false)

    try {
      logger.debug('[restoreLegacy] read data.json')

      // Read data.json
      const dataPath = path.join(this.tempDir, 'data.json')
      const data = await fsp.readFile(dataPath, 'utf-8')
      onProgress({ stage: 'reading_data', progress: 35, total: 100 })

      logger.debug('[restoreLegacy] restore Data directory')

      const userDataPath = app.getPath('userData')
      const dataSourcePath = path.join(this.tempDir, 'Data')
      const dataDestPath = path.join(userDataPath, 'Data.restore')

      const dataExists = await pathExists(dataSourcePath)
      const dataFiles = dataExists ? await fsp.readdir(dataSourcePath) : []

      if (dataExists && dataFiles.length > 0) {
        // Get total size of source directory
        const dataTotalSize = await this.getDirSize(dataSourcePath, { dereferenceSymlinks: false })

        await removePath(dataDestPath).catch(() => {})

        // Use streaming copy
        await this.copyDirWithProgress(
          dataSourcePath,
          dataDestPath,
          this.createCopyProgressHandler(dataTotalSize, 35, 85, 'copying_files', onProgress),
          { dereferenceSymlinks: false }
        )
      } else {
        logger.debug('[restoreLegacy] skipBackupFile is true, skip restoring Data directory')
      }

      // Clean up temp directory
      logger.debug('[restoreLegacy] clean up temp directory')
      await removePath(this.tempDir)

      onProgress({ stage: 'completed', progress: 100, total: 100 })

      logger.info('[restoreLegacy] Restore completed successfully')

      return data
    } catch (error) {
      logger.error('[restoreLegacy] Restore failed:', error as Error)
      await removePath(this.tempDir).catch(() => {})
      throw error
    }
  }

  /**
   * Restore from a local backup file
   * @param _ - Electron IPC event
   * @param fileName - Name of the backup file
   * @param localBackupDir - Directory where the backup file is located
   * @returns Result from restore operation
   */
  async restoreFromLocalBackup(_: Electron.IpcMainInvokeEvent, fileName: string, localBackupDir: string) {
    try {
      const backupPath = resolveAndValidatePath(localBackupDir, fileName)

      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`)
      }

      return await this.restore(_, backupPath)
    } catch (error) {
      logger.error('[BackupManager] Local restore failed:', error as Error)
      throw error
    }
  }

  /**
   * Restore from a WebDAV backup
   * Downloads the backup file from WebDAV server and restores it.
   * @param _ - Electron IPC event
   * @param webdavConfig - WebDAV configuration including server URL, credentials, and file name
   * @returns Result from restore operation
   */
  async restoreFromWebdav(_: Electron.IpcMainInvokeEvent, webdavConfig: WebDavConfig) {
    const filename = webdavConfig.fileName || 'cherry-studio.backup.zip'
    const webdavClient = this.getWebDavInstance(webdavConfig)
    try {
      const retrievedFile = await webdavClient.getFileContents(filename)
      const backupedFilePath = path.join(this.backupDir, filename)

      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true })
      }

      // Write file using streaming
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(backupedFilePath)
        writeStream.write(retrievedFile as Buffer)
        writeStream.end()

        writeStream.on('finish', () => resolve())
        writeStream.on('error', (error) => reject(error))
      })

      return await this.restore(_, backupedFilePath)
    } catch (error: any) {
      logger.error('Failed to restore from WebDAV:', error)
      throw new Error(error.message || 'Failed to restore backup file')
    }
  }

  /**
   * Restore from an S3 backup
   * Downloads the backup file from S3 storage and restores it.
   * @param _ - Electron IPC event
   * @param s3Config - S3 configuration including bucket, credentials, and file name
   * @returns Result from restore operation
   */
  async restoreFromS3(_: Electron.IpcMainInvokeEvent, s3Config: S3Config) {
    const filename = s3Config.fileName || 'cherry-studio.backup.zip'

    logger.debug(`Starting restore from S3: ${filename}`)

    const s3Client = this.getS3Storage(s3Config)
    try {
      const retrievedFile = await s3Client.getFileContents(filename)
      const backupedFilePath = path.join(this.backupDir, filename)
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true })
      }
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(backupedFilePath)
        writeStream.write(retrievedFile)
        writeStream.end()
        writeStream.on('finish', () => resolve())
        writeStream.on('error', (error) => reject(error))
      })

      logger.info(`S3 restore file downloaded successfully: ${filename}`)
      return await this.restore(_, backupedFilePath)
    } catch (error: any) {
      logger.error('[BackupManager] Failed to restore from S3:', error)
      throw new Error(error.message || 'Failed to restore backup file')
    }
  }

  // ==================== File Utility Methods ====================
  // These are helper methods for file operations like size calculation,
  // directory copying with progress, and permission management.

  /**
   * Create a progress callback that sends IPC message and optionally logs.
   * copying_files stage is never logged as it generates too many logs.
   */
  private onProgress = (channel: IpcChannel, shouldLog: boolean) => {
    return (processData: ProgressData) => {
      const mainWindow = windowService.getMainWindow()
      mainWindow?.webContents.send(channel, processData)
      // Never log copying_files as it generates too many log entries
      if (shouldLog && processData.stage !== 'copying_files') {
        logger.info('Backup progress', processData)
      }
    }
  }

  private createCopyProgressHandler(
    totalSize: number,
    startProgress: number,
    endProgress: number,
    stage: string,
    onProgress: (processData: ProgressData) => void
  ) {
    let copiedSize = 0
    let lastReported = startProgress

    return (size: number) => {
      copiedSize += size
      const progress =
        totalSize > 0
          ? Math.min(endProgress, startProgress + Math.floor((copiedSize / totalSize) * (endProgress - startProgress)))
          : endProgress
      if (progress === lastReported && copiedSize < totalSize) {
        return
      }
      lastReported = progress
      onProgress({ stage, progress, total: 100 })
    }
  }

  /**
   * Calculate total size of a directory recursively
   * @param dirPath - Directory path to calculate size
   * @returns Total size in bytes
   */
  private async getDirSize(
    dirPath: string,
    options: CopyDirOptions,
    activeDirectoryRealPaths = new Set<string>()
  ): Promise<number> {
    const copyOptions = {
      ...options,
      sourceRootRealPath: options.sourceRootRealPath ?? (await fsp.realpath(dirPath))
    }
    const directoryRealPath = await this.enterDirectory(dirPath, activeDirectoryRealPaths)

    if (!directoryRealPath) {
      return 0
    }

    let size = 0

    try {
      const items = await fsp.readdir(dirPath, { withFileTypes: true })

      for (const item of items) {
        const fullPath = path.join(dirPath, item.name)
        const entry = await this.getEffectiveEntryStats(fullPath, copyOptions)

        if (!entry) {
          continue
        }

        if (entry.stats.isDirectory()) {
          if (entry.isSymlink) {
            try {
              size += await this.getDirSize(fullPath, copyOptions, activeDirectoryRealPaths)
            } catch (error) {
              this.logSkippedSymlink(fullPath, error)
            }
          } else {
            size += await this.getDirSize(fullPath, copyOptions, activeDirectoryRealPaths)
          }
        } else if (entry.stats.isFile()) {
          size += entry.stats.size
        }
      }
    } finally {
      activeDirectoryRealPaths.delete(directoryRealPath)
    }

    return size
  }

  /**
   * Stage an empty Data directory; handleStartupRestore swaps it in on next launch.
   * Avoids races with libsql / MemoryService / KnowledgeService recreating files
   * before relaunch.
   */
  public async resetData() {
    const dataRestorePath = getDataPath() + '.restore'
    await removePath(dataRestorePath).catch(() => {})
    await ensureDir(dataRestorePath)
  }

  /**
   * Deep compare two WebDAV config objects for equality
   * Only compares core fields that affect client connection, ignores volatile fields like fileName
   * @param cachedConfig - The cached WebDAV configuration
   * @param config - The new WebDAV configuration to compare
   * @returns True if the configs are equal (connection-related fields only)
   */
  private isWebDavConfigEqual(cachedConfig: typeof this.cachedWebdavConnectionConfig, config: WebDavConfig): boolean {
    if (!cachedConfig) return false

    return (
      cachedConfig.webdavHost === config.webdavHost &&
      cachedConfig.webdavUser === config.webdavUser &&
      cachedConfig.webdavPass === config.webdavPass &&
      cachedConfig.webdavPath === config.webdavPath
    )
  }

  /**
   * Get WebDav instance, reuses existing instance if connection config hasn't changed
   * Note: Only connection-related config changes will recreate the instance
   * Other config changes don't affect instance reuse
   * @param config - WebDAV configuration
   * @returns WebDav instance
   */
  private getWebDavInstance(config: WebDavConfig): WebDav {
    // Check if core connection config has changed
    const configChanged = !this.isWebDavConfigEqual(this.cachedWebdavConnectionConfig, config)

    if (configChanged || !this.webdavInstance) {
      this.webdavInstance = new WebDav(config)
      // Only cache connection-related config fields
      this.cachedWebdavConnectionConfig = {
        webdavHost: config.webdavHost,
        webdavUser: config.webdavUser,
        webdavPass: config.webdavPass,
        webdavPath: config.webdavPath
      }
      logger.debug('[BackupManager] Created new WebDav instance')
    } else {
      logger.debug('[BackupManager] Reusing existing WebDav instance')
    }

    return this.webdavInstance
  }

  // ==================== WebDAV Methods ====================
  // These methods handle backup operations with WebDAV servers.

  /**
   * List backup files on WebDAV server
   * @param _ - Electron IPC event
   * @param config - WebDAV configuration
   * @returns Array of backup file info (name, modified time, size), sorted by newest first
   */
  listWebdavFiles = async (_: Electron.IpcMainInvokeEvent, config: WebDavConfig) => {
    try {
      const client = this.getWebDavInstance(config)
      const files = await client.getDirectoryContents()

      return files
        .filter((file: FileStat) => file.type === 'file' && file.basename.endsWith('.zip'))
        .map((file: FileStat) => ({
          fileName: file.basename,
          modifiedTime: file.lastmod,
          size: file.size
        }))
        .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
    } catch (error: any) {
      logger.error('Failed to list WebDAV files:', error)
      throw new Error(error.message || 'Failed to list backup files')
    }
  }

  /**
   * Copy directory with progress reporting
   * Recursively copies files from source to destination while reporting progress
   * @param source - Source directory path
   * @param destination - Destination directory path
   * @param onProgress - Callback function called with size of each copied file
   */
  private async copyDirWithProgress(
    source: string,
    destination: string,
    onProgress: (size: number) => void,
    options: CopyDirOptions
  ): Promise<void> {
    const copyOptions = {
      ...options,
      sourceRootRealPath: options.sourceRootRealPath ?? (await fsp.realpath(source))
    }
    const activeDirectoryRealPaths = new Set<string>()

    const copyDir = async (src: string, dest: string): Promise<void> => {
      const directoryRealPath = await this.enterDirectory(src, activeDirectoryRealPaths)

      if (!directoryRealPath) {
        return
      }

      try {
        await ensureDir(dest)

        const items = await fsp.readdir(src, { withFileTypes: true })

        for (const item of items) {
          const sourcePath = path.join(src, item.name)
          const destPath = path.join(dest, item.name)
          const entry = await this.getEffectiveEntryStats(sourcePath, copyOptions)

          if (!entry) {
            continue
          }

          if (entry.stats.isDirectory()) {
            try {
              await copyDir(sourcePath, destPath)
            } catch (error) {
              if (!entry.isSymlink) {
                throw error
              }
              await removePath(destPath).catch(() => {})
              this.logSkippedSymlink(sourcePath, error)
            }
          } else if (entry.stats.isFile()) {
            if (entry.isSymlink) {
              await copyPath(sourcePath, destPath, { dereference: true })
            } else {
              await copyPath(sourcePath, destPath)
            }
            onProgress(entry.stats.size)
          } else if (entry.isSymlink) {
            logger.warn('[BackupManager] Skipping symlink to unsupported target', { path: sourcePath })
          }
        }
      } finally {
        activeDirectoryRealPaths.delete(directoryRealPath)
      }
    }

    await copyDir(source, destination)
  }

  private async enterDirectory(dirPath: string, activeDirectoryRealPaths: Set<string>): Promise<string | null> {
    const realPath = await fsp.realpath(dirPath)

    if (activeDirectoryRealPaths.has(realPath)) {
      logger.warn('[BackupManager] Skipping circular symlink directory', { path: dirPath, realPath })
      return null
    }

    activeDirectoryRealPaths.add(realPath)
    return realPath
  }

  private async getEffectiveEntryStats(
    sourcePath: string,
    options: CopyDirOptions
  ): Promise<EffectiveEntryStats | null> {
    const stats = await fsp.lstat(sourcePath)

    if (!stats.isSymbolicLink()) {
      return { isSymlink: false, stats }
    }

    const targetStats = await this.getSymlinkTargetStats(sourcePath, options)
    return targetStats ? { isSymlink: true, stats: targetStats } : null
  }

  private async getSymlinkTargetStats(sourcePath: string, options: CopyDirOptions): Promise<fs.Stats | null> {
    if (!options.dereferenceSymlinks) {
      logger.warn('[BackupManager] Skipping symlink (dereferenceSymlinks=false)', { path: sourcePath })
      return null
    }

    try {
      const [targetStats, targetRealPath] = await Promise.all([fsp.stat(sourcePath), fsp.realpath(sourcePath)])
      const context = {
        path: sourcePath,
        sourceRootRealPath: options.sourceRootRealPath,
        targetRealPath
      }

      if (options.sourceRootRealPath && !isPathInside(targetRealPath, options.sourceRootRealPath)) {
        logger.warn('[BackupManager] Dereferencing symlink outside source root during backup copy', context)
      } else {
        logger.info('[BackupManager] Dereferencing symlink during backup copy', context)
      }
      return targetStats
    } catch (error) {
      this.logSkippedSymlink(sourcePath, error)
      return null
    }
  }

  private logSkippedSymlink(sourcePath: string, error: unknown) {
    logger.warn('[BackupManager] Skipping broken or unreadable symlink', { path: sourcePath, error })
  }

  /**
   * Check WebDAV connection
   * @param _ - Electron IPC event
   * @param webdavConfig - WebDAV configuration to test
   * @returns True if connection is successful
   */
  async checkConnection(_: Electron.IpcMainInvokeEvent, webdavConfig: WebDavConfig) {
    const webdavClient = this.getWebDavInstance(webdavConfig)
    return await webdavClient.checkConnection()
  }

  /**
   * Create a directory on WebDAV server
   * @param _ - Electron IPC event
   * @param webdavConfig - WebDAV configuration
   * @param path - Directory path to create
   * @param options - Optional directory creation options
   * @returns Result from WebDAV operation
   */
  async createDirectory(
    _: Electron.IpcMainInvokeEvent,
    webdavConfig: WebDavConfig,
    path: string,
    options?: CreateDirectoryOptions
  ) {
    const webdavClient = this.getWebDavInstance(webdavConfig)
    return await webdavClient.createDirectory(path, options)
  }

  /**
   * Delete a backup file from WebDAV server
   * @param _ - Electron IPC event
   * @param fileName - Name of the file to delete
   * @param webdavConfig - WebDAV configuration
   * @returns Result from WebDAV operation
   */
  async deleteWebdavFile(_: Electron.IpcMainInvokeEvent, fileName: string, webdavConfig: WebDavConfig) {
    try {
      const webdavClient = this.getWebDavInstance(webdavConfig)
      return await webdavClient.deleteFile(fileName)
    } catch (error: any) {
      logger.error('Failed to delete WebDAV file:', error)
      throw new Error(error.message || 'Failed to delete backup file')
    }
  }

  // ==================== Local Backup Methods ====================
  // These methods handle backup operations with local directories.

  /**
   * List backup files in a local directory
   * @param _ - Electron IPC event
   * @param localBackupDir - Directory to list backup files from
   * @returns Array of backup file info (name, modified time, size), sorted by newest first
   */
  async listLocalBackupFiles(_: Electron.IpcMainInvokeEvent, localBackupDir: string) {
    try {
      const files = await fsp.readdir(localBackupDir)
      const result: Array<{ fileName: string; modifiedTime: string; size: number }> = []

      for (const file of files) {
        const filePath = path.join(localBackupDir, file)
        const stat = await fsp.stat(filePath)

        if (stat.isFile() && file.endsWith('.zip')) {
          result.push({
            fileName: file,
            modifiedTime: stat.mtime.toISOString(),
            size: stat.size
          })
        }
      }

      // Sort by modified time, newest first
      return result.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
    } catch (error) {
      logger.error('[BackupManager] List local backup files failed:', error as Error)
      throw error
    }
  }

  /**
   * Delete a local backup file
   * @param _ - Electron IPC event
   * @param fileName - Name of the file to delete
   * @param localBackupDir - Directory where the backup file is located
   * @returns True if deletion was successful
   */
  async deleteLocalBackupFile(_: Electron.IpcMainInvokeEvent, fileName: string, localBackupDir: string) {
    try {
      const filePath = resolveAndValidatePath(localBackupDir, fileName)

      if (!fs.existsSync(filePath)) {
        throw new Error(`Backup file not found: ${filePath}`)
      }

      await removePath(filePath)
      return true
    } catch (error) {
      logger.error('[BackupManager] Delete local backup file failed:', error as Error)
      throw error
    }
  }

  // ==================== S3 Methods ====================
  // These methods handle backup operations with S3-compatible storage.

  /**
   * Get S3Storage instance, reuses existing instance if connection config hasn't changed
   * Note: Only connection-related config changes will recreate the instance
   * Other config changes don't affect instance reuse
   * @param config - S3 configuration
   * @returns S3Storage instance
   */
  private getS3Storage(config: S3Config): S3Storage {
    // Check if core connection config has changed
    const configChanged = !this.isS3ConfigEqual(this.cachedS3ConnectionConfig, config)

    if (configChanged || !this.s3Storage) {
      this.s3Storage = new S3Storage(config)
      // Only cache connection-related config fields
      this.cachedS3ConnectionConfig = {
        endpoint: config.endpoint,
        region: config.region,
        bucket: config.bucket,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        root: config.root
      }
      logger.debug('[BackupManager] Created new S3Storage instance')
    } else {
      logger.debug('[BackupManager] Reusing existing S3Storage instance')
    }

    return this.s3Storage
  }

  /**
   * Compare two S3 config objects for equality
   * Only compares core fields that affect client connection, ignores volatile fields like fileName
   * @param cachedConfig - The cached S3 configuration
   * @param config - The new S3 configuration to compare
   * @returns True if the configs are equal (connection-related fields only)
   */
  private isS3ConfigEqual(cachedConfig: typeof this.cachedS3ConnectionConfig, config: S3Config): boolean {
    if (!cachedConfig) return false

    return (
      cachedConfig.endpoint === config.endpoint &&
      cachedConfig.region === config.region &&
      cachedConfig.bucket === config.bucket &&
      cachedConfig.accessKeyId === config.accessKeyId &&
      cachedConfig.secretAccessKey === config.secretAccessKey &&
      cachedConfig.root === config.root
    )
  }

  /**
   * Check S3 connection
   * @param _ - Electron IPC event
   * @param s3Config - S3 configuration to test
   * @returns True if connection is successful
   */
  async checkS3Connection(_: Electron.IpcMainInvokeEvent, s3Config: S3Config) {
    const s3Client = this.getS3Storage(s3Config)
    return await s3Client.checkConnection()
  }

  /**
   * List backup files in S3 storage
   * @param _ - Electron IPC event
   * @param s3Config - S3 configuration
   * @returns Array of backup file info (name, modified time, size), sorted by newest first
   */
  listS3Files = async (_: Electron.IpcMainInvokeEvent, s3Config: S3Config) => {
    try {
      const s3Client = this.getS3Storage(s3Config)

      const objects = await s3Client.listFiles()
      const files = objects
        .filter((obj) => obj.key.endsWith('.zip'))
        .map((obj) => {
          const segments = obj.key.split('/')
          const fileName = segments[segments.length - 1]
          return {
            fileName,
            modifiedTime: obj.lastModified || '',
            size: obj.size
          }
        })

      return files.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
    } catch (error: any) {
      logger.error('Failed to list S3 files:', error)
      throw new Error(error.message || 'Failed to list backup files')
    }
  }

  /**
   * Delete a backup file from S3 storage
   * @param _ - Electron IPC event
   * @param fileName - Name of the file to delete
   * @param s3Config - S3 configuration
   * @returns Result from S3 operation
   */
  async deleteS3File(_: Electron.IpcMainInvokeEvent, fileName: string, s3Config: S3Config) {
    try {
      const s3Client = this.getS3Storage(s3Config)
      return await s3Client.deleteFile(fileName)
    } catch (error: any) {
      logger.error('Failed to delete S3 file:', error)
      throw new Error(error.message || 'Failed to delete backup file')
    }
  }
}

export { BackupManager }

export default BackupManager
