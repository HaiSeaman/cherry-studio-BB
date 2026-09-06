import { loggerService } from '@logger'
import { resolveBundledRipgrepPath } from '@main/utils/bundledBinaries'
import {
  checkName,
  getFilesDir,
  getFileType as getFileTypeByExt,
  getName,
  getTempDir,
  readTextFileWithAutoEncoding,
  resolveAndValidatePath
} from '@main/utils/file'
import { t } from '@main/utils/locales'
import { documentExts, KB, MB } from '@shared/config/constant'
import { parseDataUrl } from '@shared/utils'
import type { FileMetadata, FileType } from '@types'
import { FILE_TYPE } from '@types'
import chardet from 'chardet'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'
import * as crypto from 'crypto'
import type { OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from 'electron'
import { app, dialog, net, shell } from 'electron'
import * as fs from 'fs'
import { writeFileSync } from 'fs'
import { readFile } from 'fs/promises'

const COMMON_RIPGREP_EXCLUDES = [
  '-g',
  '!**/node_modules/**',
  '-g',
  '!**/.git/**',
  '-g',
  '!**/.idea/**',
  '-g',
  '!**/.vscode/**',
  '-g',
  '!**/.DS_Store',
  '-g',
  '!**/dist/**',
  '-g',
  '!**/build/**',
  '-g',
  '!**/.next/**',
  '-g',
  '!**/.nuxt/**',
  '-g',
  '!**/coverage/**',
  '-g',
  '!**/.cache/**'
]
import { isBinaryFile } from 'isbinaryfile'
import * as path from 'path'
import WordExtractor from 'word-extractor'

const logger = loggerService.withContext('FileStorage')

/** Maximum size of a downloaded file (streamed to disk, capped). */
const MAX_DOWNLOAD_BYTES = 200 * MB

/** Only http/https URLs may be fetched by the download IPC. */
function isAllowedDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// Get ripgrep binary path
const getRipgrepBinaryPath = (): string | null => {
  try {
    const ripgrepBinaryPath = resolveBundledRipgrepPath()

    if (fs.existsSync(ripgrepBinaryPath)) {
      return ripgrepBinaryPath
    }
    return null
  } catch (error) {
    logger.error('Failed to locate ripgrep binary:', error as Error)
    return null
  }
}

/**
 * Execute ripgrep with captured output
 */
function executeRipgrep(args: string[]): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const ripgrepBinaryPath = getRipgrepBinaryPath()

    if (!ripgrepBinaryPath) {
      reject(new Error('Ripgrep binary not available'))
      return
    }

    const { spawn } = require('child_process')
    const child = spawn(ripgrepBinaryPath, ['--no-config', '--ignore-case', ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''

    child.stdout.on('data', (data: Buffer) => {
      output += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString()
    })

    child.on('close', (code: number) => {
      resolve({
        exitCode: code || 0,
        output: output || errorOutput
      })
    })

    child.on('error', (error: Error) => {
      reject(error)
    })
  })
}

interface FileWatcherConfig {
  watchExtensions?: string[]
  ignoredPatterns?: (string | RegExp)[]
  debounceMs?: number
  maxDepth?: number
  usePolling?: boolean
  retryOnError?: boolean
  retryDelayMs?: number
  stabilityThreshold?: number
  eventChannel?: string
}

const DEFAULT_WATCHER_CONFIG: Required<FileWatcherConfig> = {
  watchExtensions: ['.md', '.markdown', '.txt'],
  ignoredPatterns: [/(^|[/\\])\../, '**/node_modules/**', '**/.git/**', '**/*.tmp', '**/*.temp', '**/.DS_Store'],
  debounceMs: 1000,
  maxDepth: 10,
  usePolling: false,
  retryOnError: true,
  retryDelayMs: 5000,
  stabilityThreshold: 500,
  eventChannel: 'file-change'
}

interface DirectoryListOptions {
  recursive?: boolean
  maxDepth?: number
  includeHidden?: boolean
  includeFiles?: boolean
  includeDirectories?: boolean
  maxEntries?: number
  searchPattern?: string
  fuzzy?: boolean
}

const DEFAULT_DIRECTORY_LIST_OPTIONS: Required<DirectoryListOptions> = {
  recursive: true,
  maxDepth: 10,
  includeHidden: false,
  includeFiles: true,
  includeDirectories: true,
  maxEntries: 20,
  searchPattern: '.',
  fuzzy: true
}

class FileStorage {
  private storageDir = getFilesDir()
  private _tempDir = getTempDir()
  private watcher?: FSWatcher
  private watcherSender?: Electron.WebContents
  private currentWatchPath?: string
  private debounceTimer?: NodeJS.Timeout
  private watcherConfig: Required<FileWatcherConfig> = DEFAULT_WATCHER_CONFIG

  private get tempDir(): string {
    if (!fs.existsSync(this._tempDir)) {
      fs.mkdirSync(this._tempDir, { recursive: true })
    }
    return this._tempDir
  }

  /**
   * Resolve a renderer-supplied id/path inside storageDir, rejecting any
   * path traversal (`..`/absolute paths) with an explicit error.
   */
  private resolveStoragePath(id: string): string {
    return resolveAndValidatePath(this.storageDir, id)
  }

  constructor() {
    this.initStorageDir()
  }

  private initStorageDir = (): void => {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }
    } catch (error) {
      logger.error('Failed to initialize storage directories:', error as Error)
      throw error
    }
  }

  // @TraceProperty({ spanName: 'getFileHash', tag: 'FileStorage' })
  private getFileHash = async (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  private findDuplicateFile = async (filePath: string): Promise<FileMetadata | null> => {
    const stats = fs.statSync(filePath)
    logger.debug(`stats: ${stats}, filePath: ${filePath}`)
    const fileSize = stats.size

    const files = await fs.promises.readdir(this.storageDir)
    // 源文件哈希只算一次，避免对每个同尺寸候选重复做全文件 MD5（K 个候选 = K 次哈希）
    const originalHash = await this.getFileHash(filePath)
    for (const file of files) {
      const storedFilePath = path.join(this.storageDir, file)
      const storedStats = fs.statSync(storedFilePath)

      if (storedStats.size === fileSize) {
        const storedHash = await this.getFileHash(storedFilePath)

        if (originalHash === storedHash) {
          const ext = path.extname(file)
          const id = path.basename(file, ext)
          const type = await this.getFileType(filePath)

          return {
            id,
            origin_name: file,
            name: file + ext,
            path: storedFilePath,
            created_at: storedStats.birthtime.toISOString(),
            size: storedStats.size,
            ext,
            type,
            count: 2
          }
        }
      }
    }

    return null
  }

  public getFileType = async (filePath: string): Promise<FileType> => {
    const ext = path.extname(filePath)
    const fileType = getFileTypeByExt(ext)

    return fileType === FILE_TYPE.OTHER && (await this._isTextFile(filePath)) ? FILE_TYPE.TEXT : fileType
  }

  public selectFile = async (
    _: Electron.IpcMainInvokeEvent,
    options?: OpenDialogOptions
  ): Promise<FileMetadata[] | null> => {
    const defaultOptions: OpenDialogOptions = {
      properties: ['openFile']
    }

    const dialogOptions = { ...defaultOptions, ...options }

    const result = await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const fileMetadataPromises = result.filePaths.map(async (filePath) => {
      const stats = fs.statSync(filePath)
      const ext = path.extname(filePath)
      const fileType = await this.getFileType(filePath)

      return {
        id: crypto.randomUUID(),
        origin_name: path.basename(filePath),
        name: path.basename(filePath),
        path: filePath,
        created_at: stats.birthtime.toISOString(),
        size: stats.size,
        ext: ext,
        type: fileType,
        count: 1
      }
    })

    return Promise.all(fileMetadataPromises)
  }

  public uploadFile = async (_: Electron.IpcMainInvokeEvent, file: FileMetadata): Promise<FileMetadata> => {
    const filePath = file.path
    const duplicateFile = await this.findDuplicateFile(filePath)

    if (duplicateFile) {
      return duplicateFile
    }

    const uuid = crypto.randomUUID()
    const origin_name = path.basename(file.path)
    const ext = path.extname(origin_name).toLowerCase()
    const destPath = path.join(this.storageDir, uuid + ext)

    logger.info(`[FileStorage] Uploading file: ${filePath}`)

    await fs.promises.copyFile(filePath, destPath)

    const stats = await fs.promises.stat(destPath)
    const fileType = await this.getFileType(destPath)

    const fileMetadata: FileMetadata = {
      id: uuid,
      origin_name,
      name: uuid + ext,
      path: destPath,
      created_at: stats.birthtime.toISOString(),
      size: stats.size,
      ext: ext,
      type: fileType,
      count: 1
    }

    logger.debug(`File uploaded: ${fileMetadata}`)

    return fileMetadata
  }

  public getFile = async (_: Electron.IpcMainInvokeEvent, filePath: string): Promise<FileMetadata | null> => {
    if (!fs.existsSync(filePath)) {
      return null
    }

    const stats = fs.statSync(filePath)
    const fileType = await this.getFileType(filePath)

    return {
      id: crypto.randomUUID(),
      origin_name: path.basename(filePath),
      name: path.basename(filePath),
      path: filePath,
      created_at: stats.birthtime.toISOString(),
      size: stats.size,
      ext: path.extname(filePath),
      type: fileType,
      count: 1
    }
  }

  // @TraceProperty({ spanName: 'deleteFile', tag: 'FileStorage' })
  public deleteFile = async (_: Electron.IpcMainInvokeEvent, id: string): Promise<void> => {
    const filePath = this.resolveStoragePath(id)
    if (!fs.existsSync(filePath)) {
      return
    }
    await fs.promises.unlink(filePath)
  }

  public deleteDir = async (_: Electron.IpcMainInvokeEvent, id: string): Promise<void> => {
    const dirPath = this.resolveStoragePath(id)
    if (!fs.existsSync(dirPath)) {
      return
    }
    await fs.promises.rm(dirPath, { recursive: true })
  }

  public deleteExternalFile = async (_: Electron.IpcMainInvokeEvent, filePath: string): Promise<void> => {
    try {
      if (!fs.existsSync(filePath)) {
        return
      }

      await fs.promises.rm(filePath, { force: true })
      logger.debug(`External file deleted successfully: ${filePath}`)
    } catch (error) {
      logger.error('Failed to delete external file:', error as Error)
      throw error
    }
  }

  public deleteExternalDir = async (_: Electron.IpcMainInvokeEvent, dirPath: string): Promise<void> => {
    try {
      if (!fs.existsSync(dirPath)) {
        return
      }

      await fs.promises.rm(dirPath, { recursive: true, force: true })
      logger.debug(`External directory deleted successfully: ${dirPath}`)
    } catch (error) {
      logger.error('Failed to delete external directory:', error as Error)
      throw error
    }
  }

  public moveFile = async (_: Electron.IpcMainInvokeEvent, filePath: string, newPath: string): Promise<void> => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Source file does not exist: ${filePath}`)
      }

      // 确保目标目录存在
      const destDir = path.dirname(newPath)
      if (!fs.existsSync(destDir)) {
        await fs.promises.mkdir(destDir, { recursive: true })
      }

      // 移动文件
      await fs.promises.rename(filePath, newPath)
      logger.debug(`File moved successfully: ${filePath} to ${newPath}`)
    } catch (error) {
      logger.error('Move file failed:', error as Error)
      throw error
    }
  }

  public moveDir = async (_: Electron.IpcMainInvokeEvent, dirPath: string, newDirPath: string): Promise<void> => {
    try {
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Source directory does not exist: ${dirPath}`)
      }

      // 确保目标父目录存在
      const parentDir = path.dirname(newDirPath)
      if (!fs.existsSync(parentDir)) {
        await fs.promises.mkdir(parentDir, { recursive: true })
      }

      // 移动目录
      await fs.promises.rename(dirPath, newDirPath)
      logger.debug(`Directory moved successfully: ${dirPath} to ${newDirPath}`)
    } catch (error) {
      logger.error('Move directory failed:', error as Error)
      throw error
    }
  }

  public renameFile = async (_: Electron.IpcMainInvokeEvent, filePath: string, newName: string): Promise<void> => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Source file does not exist: ${filePath}`)
      }

      const dirPath = path.dirname(filePath)
      // Strip directory components from newName so "../" cannot escape dirPath
      const safeName = path.basename(newName)
      if (!safeName || safeName === '.' || safeName === '..') {
        throw new Error(`Invalid file name: ${newName}`)
      }
      const newFilePath = path.join(dirPath, safeName + '.md')

      // 如果目标文件已存在，抛出错误
      if (fs.existsSync(newFilePath)) {
        throw new Error(`Target file already exists: ${newFilePath}`)
      }

      // 重命名文件
      await fs.promises.rename(filePath, newFilePath)
      logger.debug(`File renamed successfully: ${filePath} to ${newFilePath}`)
    } catch (error) {
      logger.error('Rename file failed:', error as Error)
      throw error
    }
  }

  public renameDir = async (_: Electron.IpcMainInvokeEvent, dirPath: string, newName: string): Promise<void> => {
    try {
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Source directory does not exist: ${dirPath}`)
      }

      const parentDir = path.dirname(dirPath)
      const newDirPath = path.join(parentDir, newName)

      // 如果目标目录已存在，抛出错误
      if (fs.existsSync(newDirPath)) {
        throw new Error(`Target directory already exists: ${newDirPath}`)
      }

      // 重命名目录
      await fs.promises.rename(dirPath, newDirPath)
      logger.debug(`Directory renamed successfully: ${dirPath} to ${newDirPath}`)
    } catch (error) {
      logger.error('Rename directory failed:', error as Error)
      throw error
    }
  }

  /**
   * Core file reading logic that handles both documents and text files.
   *
   * @private
   * @param filePath - Full path to the file
   * @param detectEncoding - Whether to auto-detect text file encoding
   * @returns Promise resolving to the extracted text content
   * @throws Error if file reading fails
   */
  private async readFileCore(filePath: string, detectEncoding: boolean = false): Promise<string> {
    const fileExtension = path.extname(filePath)

    if (documentExts.includes(fileExtension)) {
      try {
        if (fileExtension === '.doc') {
          const extractor = new WordExtractor()
          const extracted = await extractor.extract(filePath)
          return extracted.getBody()
        }

        // officeparser 体积大且仅在解析 Office 文档时需要，按需加载以降低主进程常驻内存
        const { default: officeParser } = await import('officeparser')
        const data = await officeParser.parseOfficeAsync(filePath, {
          tempFilesLocation: this.tempDir
        })
        return data
      } catch (error) {
        logger.error('Failed to read document file:', error as Error)
        throw error
      }
    }

    try {
      if (detectEncoding) {
        return readTextFileWithAutoEncoding(filePath)
      } else {
        return fs.readFileSync(filePath, 'utf-8')
      }
    } catch (error) {
      logger.error('Failed to read text file:', error as Error)
      throw new Error(`Failed to read file: ${filePath}.`)
    }
  }

  /**
   * Reads and extracts content from a stored file.
   *
   * Supports multiple file formats including:
   * - Complex documents: .pdf, .doc, .docx, .pptx, .xlsx, .odt, .odp, .ods
   * - Text files: .txt, .md, .json, .csv, etc.
   * - Code files: .js, .ts, .py, .java, etc.
   *
   * For document formats, extracts text content using specialized parsers:
   * - .doc files: Uses word-extractor library
   * - Other Office formats: Uses officeparser library
   *
   * For text files, can optionally detect encoding automatically.
   *
   * @param _ - Electron IPC invoke event (unused)
   * @param id - File identifier with extension (e.g., "uuid.docx")
   * @param detectEncoding - Whether to auto-detect text file encoding (default: false)
   * @returns Promise resolving to the extracted text content of the file
   * @throws Error if file reading fails or file is not found
   *
   * @example
   * // Read a DOCX file
   * const content = await readFile(event, "document.docx");
   *
   * @example
   * // Read a text file with encoding detection
   * const content = await readFile(event, "text.txt", true);
   *
   * @example
   * // Read a PDF file
   * const content = await readFile(event, "manual.pdf");
   */
  public readFile = async (
    _: Electron.IpcMainInvokeEvent,
    id: string,
    detectEncoding: boolean = false
  ): Promise<string> => {
    const filePath = this.resolveStoragePath(id)
    return this.readFileCore(filePath, detectEncoding)
  }

  /**
   * Reads and extracts content from an external file path.
   *
   * Similar to readFile, but operates on external file paths instead of stored files.
   * Supports the same file formats including complex documents and text files.
   *
   * @param _ - Electron IPC invoke event (unused)
   * @param filePath - Absolute path to the external file
   * @param detectEncoding - Whether to auto-detect text file encoding (default: false)
   * @returns Promise resolving to the extracted text content of the file
   * @throws Error if file does not exist or reading fails
   *
   * @example
   * // Read an external DOCX file
   * const content = await readExternalFile(event, "/path/to/document.docx");
   *
   * @example
   * // Read an external text file with encoding detection
   * const content = await readExternalFile(event, "/path/to/text.txt", true);
   */
  public readExternalFile = async (
    _: Electron.IpcMainInvokeEvent,
    filePath: string,
    detectEncoding: boolean = false
  ): Promise<string> => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`)
    }

    return this.readFileCore(filePath, detectEncoding)
  }

  public createTempFile = async (_: Electron.IpcMainInvokeEvent, fileName: string): Promise<string> => {
    // Strip any directory components so a renderer-supplied name like
    // "../../evil.bat" cannot escape the temp dir.
    const safeName = path.basename(fileName)
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new Error('Invalid file name')
    }
    return path.join(this.tempDir, `temp_file_${crypto.randomUUID()}_${safeName}`)
  }

  public writeFile = async (
    _: Electron.IpcMainInvokeEvent,
    filePath: string,
    data: Uint8Array | string
  ): Promise<void> => {
    await fs.promises.writeFile(filePath, data)
  }

  public fileNameGuard = async (
    _: Electron.IpcMainInvokeEvent,
    dirPath: string,
    fileName: string,
    isFile: boolean
  ): Promise<{ safeName: string; exists: boolean }> => {
    const safeName = checkName(fileName)
    const finalName = getName(dirPath, safeName, isFile)
    const fullPath = path.join(dirPath, finalName + (isFile ? '.md' : ''))
    const exists = fs.existsSync(fullPath)

    logger.debug(`File name guard: ${fileName} -> ${finalName}, exists: ${exists}`)
    return { safeName: finalName, exists }
  }

  public mkdir = async (_: Electron.IpcMainInvokeEvent, dirPath: string): Promise<string> => {
    try {
      logger.debug(`Attempting to create directory: ${dirPath}`)
      await fs.promises.mkdir(dirPath, { recursive: true })
      return dirPath
    } catch (error) {
      logger.error('Failed to create directory:', error as Error)
      throw new Error(`Failed to create directory: ${dirPath}. Error: ${(error as Error).message}`)
    }
  }

  public base64Image = async (
    _: Electron.IpcMainInvokeEvent,
    id: string
  ): Promise<{ mime: string; base64: string; data: string }> => {
    const filePath = this.resolveStoragePath(id)
    const data = await fs.promises.readFile(filePath)
    const base64 = data.toString('base64')
    const rawExt = path.extname(filePath).slice(1)
    const ext = rawExt === 'jpg' ? 'jpeg' : rawExt
    const mime = ext ? `image/${ext}` : 'image/png'
    return {
      mime,
      base64,
      data: `data:${mime};base64,${base64}`
    }
  }

  public saveBase64Image = async (_: Electron.IpcMainInvokeEvent, base64Data: string): Promise<FileMetadata> => {
    try {
      if (!base64Data) {
        throw new Error('Base64 data is required')
      }

      const parseResult = parseDataUrl(base64Data)
      const base64String = parseResult?.data ?? base64Data
      const ext = parseResult?.mediaType ? this.getExtensionFromMimeType(parseResult.mediaType) : '.png'

      const buffer = Buffer.from(base64String, 'base64')
      const uuid = crypto.randomUUID()
      const destPath = path.join(this.storageDir, uuid + ext)

      logger.debug('Saving base64 image:', {
        storageDir: this.storageDir,
        destPath,
        bufferSize: buffer.length
      })

      // 确保目录存在
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }

      await fs.promises.writeFile(destPath, buffer)

      return {
        id: uuid,
        origin_name: uuid + ext,
        name: uuid + ext,
        path: destPath,
        created_at: new Date().toISOString(),
        size: buffer.length,
        ext: ext,
        type: getFileTypeByExt(ext),
        count: 1
      }
    } catch (error) {
      logger.error('Failed to save base64 image:', error as Error)
      throw error
    }
  }

  /**
   * 将 base64 图片保存到用户指定的自定义目录（图片生成自动保存）
   * 与 saveBase64Image 的区别：保存位置由用户设置（dirPath），文件名带可读时间戳
   * dirPath 为空时使用默认目录：用户图片目录/CherryStudio（获取失败退回应用数据目录）
   */
  public saveImageToDirectory = async (
    _: Electron.IpcMainInvokeEvent,
    base64Data: string,
    dirPath: string
  ): Promise<FileMetadata> => {
    try {
      if (!base64Data) {
        throw new Error('Base64 data is required')
      }

      // 解析目标目录：空则使用默认目录（用户图片目录/CherryStudio）
      if (!dirPath) {
        try {
          dirPath = path.join(app.getPath('pictures'), 'CherryStudio')
        } catch {
          dirPath = path.join(app.getPath('userData'), 'CherryStudio')
        }
      }

      const parseResult = parseDataUrl(base64Data)
      const base64String = parseResult?.data ?? base64Data
      const ext = parseResult?.mediaType ? this.getExtensionFromMimeType(parseResult.mediaType) : '.png'

      const buffer = Buffer.from(base64String, 'base64')
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, '')
        .slice(0, 15)
      const shortId = crypto.randomUUID().slice(0, 8)
      const fileName = `cherry_${timestamp}_${shortId}${ext}`
      const destPath = path.join(dirPath, fileName)

      logger.debug('Saving image to custom directory:', { dirPath, destPath, bufferSize: buffer.length })

      // 确保目录存在（目录可能尚未创建）
      await fs.promises.mkdir(dirPath, { recursive: true })
      await fs.promises.writeFile(destPath, buffer)

      return {
        id: shortId,
        origin_name: fileName,
        name: fileName,
        path: destPath,
        created_at: new Date().toISOString(),
        size: buffer.length,
        ext: ext,
        type: getFileTypeByExt(ext),
        count: 1
      }
    } catch (error) {
      logger.error('Failed to save image to directory:', error as Error)
      throw error
    }
  }

  /**
   * 静默保存任意文件（含视频）到指定目录：不弹对话框、保留原始文件名、目录不存在则创建。
   * 与 saveImageToDirectory 的区别：不强制图片扩展名，直接使用调用方提供的文件名。
   */
  public saveFileToDirectory = async (
    _: Electron.IpcMainInvokeEvent,
    fileName: string,
    base64Data: string,
    dirPath: string
  ): Promise<string> => {
    try {
      if (!fileName || !base64Data || !dirPath) {
        throw new Error('fileName, base64Data and dirPath are required')
      }

      const parseResult = parseDataUrl(base64Data)
      const base64String = parseResult?.data ?? base64Data
      const buffer = Buffer.from(base64String, 'base64')
      // 目录与文件名拼接统一走 path.join，避免混合分隔符
      const destPath = path.join(dirPath, path.basename(fileName))

      logger.debug('Saving file to custom directory:', { dirPath, destPath, bufferSize: buffer.length })

      await fs.promises.mkdir(dirPath, { recursive: true })
      await fs.promises.writeFile(destPath, buffer)
      return destPath
    } catch (error) {
      logger.error('Failed to save file to directory:', error as Error)
      throw error
    }
  }

  public base64File = async (_: Electron.IpcMainInvokeEvent, id: string): Promise<{ data: string; mime: string }> => {
    const filePath = this.resolveStoragePath(id)
    const buffer = await fs.promises.readFile(filePath)
    const base64 = buffer.toString('base64')
    const mime = `application/${path.extname(filePath).slice(1)}`
    return { data: base64, mime }
  }

  public binaryImage = async (_: Electron.IpcMainInvokeEvent, id: string): Promise<{ data: Buffer; mime: string }> => {
    const filePath = this.resolveStoragePath(id)
    const data = await fs.promises.readFile(filePath)
    const mime = `image/${path.extname(filePath).slice(1)}`
    return { data, mime }
  }

  public clear = async (): Promise<void> => {
    await fs.promises.rm(this.storageDir, { recursive: true })
    this.initStorageDir()
  }

  public clearTemp = async (): Promise<void> => {
    await fs.promises.rm(this.tempDir, { recursive: true })
    await fs.promises.mkdir(this.tempDir, { recursive: true })
  }

  public open = async (
    _: Electron.IpcMainInvokeEvent,
    options: OpenDialogOptions
  ): Promise<{ fileName: string; filePath: string; content?: Buffer; size: number } | null> => {
    try {
      const result: OpenDialogReturnValue = await dialog.showOpenDialog({
        title: t('dialog.open_file'),
        properties: ['openFile'],
        filters: [{ name: t('dialog.all_files'), extensions: ['*'] }],
        ...options
      })

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0]
        const fileName = filePath.split('/').pop() || ''
        const stats = await fs.promises.stat(filePath)

        // If the file is less than 2GB, read the content
        if (stats.size < 2 * 1024 * 1024 * 1024) {
          const content = await readFile(filePath)
          return { fileName, filePath, content, size: stats.size }
        }

        // For large files, only return file information, do not read content
        return { fileName, filePath, size: stats.size }
      }

      return null
    } catch (err) {
      logger.error('[IPC - Error] An error occurred opening the file:', err as Error)
      return null
    }
  }

  public openPath = async (_: Electron.IpcMainInvokeEvent, path: string): Promise<void> => {
    const resolved = await shell.openPath(path)
    if (resolved !== '') {
      throw new Error(resolved)
    }
  }

  /**
   * 通过相对路径打开文件，跨设备时使用
   * @param _
   * @param file
   */
  public openFileWithRelativePath = async (_: Electron.IpcMainInvokeEvent, file: FileMetadata): Promise<void> => {
    const filePath = this.resolveStoragePath(file.name)
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath).catch((err) => logger.error('[IPC - Error] Failed to open file:', err))
    } else {
      logger.warn(`[IPC - Warning] File does not exist: ${filePath}`)
    }
  }

  public listDirectory = async (
    _: Electron.IpcMainInvokeEvent,
    dirPath: string,
    options?: DirectoryListOptions
  ): Promise<string[]> => {
    const mergedOptions: Required<DirectoryListOptions> = {
      ...DEFAULT_DIRECTORY_LIST_OPTIONS,
      ...options
    }

    const resolvedPath = path.resolve(dirPath)

    const stat = await fs.promises.stat(resolvedPath).catch((error) => {
      logger.error(`[IPC - Error] Failed to access directory: ${resolvedPath}`, error as Error)
      throw error
    })

    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedPath}`)
    }

    // Use ripgrep for file listing with relevance-based sorting
    if (!getRipgrepBinaryPath()) {
      throw new Error('Ripgrep binary not available')
    }

    return await this.listDirectoryWithRipgrep(resolvedPath, mergedOptions)
  }

  /**
   * Search directories by name pattern
   */
  private async searchDirectories(
    resolvedPath: string,
    options: Required<DirectoryListOptions>,
    currentDepth: number = 0
  ): Promise<string[]> {
    if (!options.includeDirectories) return []
    if (!options.recursive && currentDepth > 0) return []
    if (options.maxDepth > 0 && currentDepth >= options.maxDepth) return []

    const directories: string[] = []
    const excludedDirs = new Set([
      'node_modules',
      '.git',
      '.idea',
      '.vscode',
      'dist',
      'build',
      '.next',
      '.nuxt',
      'coverage',
      '.cache'
    ])

    try {
      const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true })
      const searchPatternLower = options.searchPattern.toLowerCase()

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        // Skip hidden directories unless explicitly included
        if (!options.includeHidden && entry.name.startsWith('.')) continue

        // Skip excluded directories
        if (excludedDirs.has(entry.name)) continue

        const fullPath = path.join(resolvedPath, entry.name).replace(/\\/g, '/')

        // Check if directory name matches search pattern
        if (options.searchPattern === '.' || entry.name.toLowerCase().includes(searchPatternLower)) {
          directories.push(fullPath)
        }

        // Recursively search subdirectories
        if (options.recursive && currentDepth < options.maxDepth) {
          const subDirs = await this.searchDirectories(fullPath, options, currentDepth + 1)
          directories.push(...subDirs)
        }
      }
    } catch (error) {
      logger.warn(`Failed to search directories in: ${resolvedPath}`, error as Error)
    }

    return directories
  }

  /**
   * Search files by filename pattern
   */
  private async searchByFilename(resolvedPath: string, options: Required<DirectoryListOptions>): Promise<string[]> {
    const files: string[] = []
    const directories: string[] = []

    // Search for files using ripgrep
    if (options.includeFiles) {
      const args: string[] = ['--files']

      // Handle hidden files
      if (!options.includeHidden) {
        args.push('--glob', '!.*')
      }

      // Use --iglob to let ripgrep filter filenames (case-insensitive)
      if (options.searchPattern && options.searchPattern !== '.') {
        args.push('--iglob', `*${options.searchPattern}*`)
      }

      // Exclude common hidden directories and large directories
      args.push(...COMMON_RIPGREP_EXCLUDES)

      // Handle max depth
      if (!options.recursive) {
        args.push('--max-depth', '1')
      } else if (options.maxDepth > 0) {
        args.push('--max-depth', options.maxDepth.toString())
      }

      // Add the directory path
      args.push(resolvedPath)

      const { exitCode, output } = await executeRipgrep(args)

      // Exit code 0 means files found, 1 means no files found (still success), 2+ means error
      if (exitCode >= 2) {
        throw new Error(`Ripgrep failed with exit code ${exitCode}: ${output}`)
      }

      // Parse ripgrep output (no need to filter by filename - ripgrep already did it)
      files.push(
        ...output
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => line.replace(/\\/g, '/'))
      )
    }

    // Search for directories
    if (options.includeDirectories) {
      directories.push(...(await this.searchDirectories(resolvedPath, options)))
    }

    // Combine and sort: directories first (alphabetically), then files (alphabetically)
    const sortedDirectories = directories.sort((a, b) => {
      const aName = path.basename(a)
      const bName = path.basename(b)
      return aName.localeCompare(bName)
    })

    const sortedFiles = files.sort((a, b) => {
      const aName = path.basename(a)
      const bName = path.basename(b)
      return aName.localeCompare(bName)
    })

    return [...sortedDirectories, ...sortedFiles].slice(0, options.maxEntries)
  }

  /**
   * Fuzzy match: checks if all characters in query appear in text in order (case-insensitive)
   * Example: "updater" matches "packages/update/src/node/updateController.ts"
   */
  private isFuzzyMatch(text: string, query: string): boolean {
    let i = 0 // text index
    let j = 0 // query index
    const textLower = text.toLowerCase()
    const queryLower = query.toLowerCase()

    while (i < textLower.length && j < queryLower.length) {
      if (textLower[i] === queryLower[j]) {
        j++
      }
      i++
    }
    return j === queryLower.length
  }

  /**
   * Scoring constants for fuzzy match relevance ranking
   * Higher values = higher priority in search results
   */
  private static readonly SCORE_SEGMENT_MATCH = 60 // Per path segment that matches query
  private static readonly SCORE_FILENAME_CONTAINS = 80 // Filename contains exact query substring
  private static readonly SCORE_FILENAME_STARTS = 100 // Filename starts with query (highest priority)
  private static readonly SCORE_CONSECUTIVE_CHAR = 15 // Per consecutive character match
  private static readonly SCORE_WORD_BOUNDARY = 20 // Query matches start of a word
  private static readonly PATH_LENGTH_PENALTY_FACTOR = 4 // Logarithmic penalty multiplier for longer paths

  /**
   * Calculate fuzzy match score (higher is better)
   * Scoring factors:
   * - Consecutive character matches (bonus)
   * - Match at word boundaries (bonus)
   * - Shorter path length (bonus)
   * - Match in filename vs directory (bonus)
   */
  private getFuzzyMatchScore(filePath: string, query: string): number {
    const pathLower = filePath.toLowerCase()
    const queryLower = query.toLowerCase()
    const fileName = filePath.split('/').pop() || ''
    const fileNameLower = fileName.toLowerCase()

    let score = 0

    // Count how many times query-related words appear in path segments
    const pathSegments = pathLower.split(/[/\\]/)
    let segmentMatchCount = 0
    for (const segment of pathSegments) {
      if (this.isFuzzyMatch(segment, queryLower)) {
        segmentMatchCount++
      }
    }
    score += segmentMatchCount * FileStorage.SCORE_SEGMENT_MATCH

    // Bonus for filename starting with query (stronger than generic "contains")
    if (fileNameLower.startsWith(queryLower)) {
      score += FileStorage.SCORE_FILENAME_STARTS
    } else if (fileNameLower.includes(queryLower)) {
      // Bonus for exact substring match in filename (e.g., "updater" in "RCUpdater.js")
      score += FileStorage.SCORE_FILENAME_CONTAINS
    }

    // Calculate consecutive match bonus
    let i = 0
    let j = 0
    let consecutiveCount = 0
    let maxConsecutive = 0

    while (i < pathLower.length && j < queryLower.length) {
      if (pathLower[i] === queryLower[j]) {
        consecutiveCount++
        maxConsecutive = Math.max(maxConsecutive, consecutiveCount)
        j++
      } else {
        consecutiveCount = 0
      }
      i++
    }
    score += maxConsecutive * FileStorage.SCORE_CONSECUTIVE_CHAR

    // Bonus for word boundary matches (e.g., "upd" matches start of "update")
    // Only count once to avoid inflating scores for paths with repeated patterns
    const boundaryPrefix = queryLower.slice(0, Math.min(3, queryLower.length))
    const words = pathLower.split(/[/\\._-]/)
    for (const word of words) {
      if (word.startsWith(boundaryPrefix)) {
        score += FileStorage.SCORE_WORD_BOUNDARY
        break
      }
    }

    // Penalty for longer paths (prefer shorter, more specific matches)
    // Use logarithmic scaling to prevent long paths from dominating the score
    // A 50-char path gets ~-16 penalty, 100-char gets ~-18, 200-char gets ~-21
    score -= Math.log(filePath.length + 1) * FileStorage.PATH_LENGTH_PENALTY_FACTOR

    return score
  }

  /**
   * Convert query to glob pattern for ripgrep pre-filtering
   * e.g., "updater" -> "*u*p*d*a*t*e*r*"
   */
  private queryToGlobPattern(query: string): string {
    // Escape special glob characters (including ! for negation)
    const escaped = query.replace(/[[\]{}()*+?.,\\^$|#!]/g, '\\$&')
    // Convert to fuzzy glob: each char separated by *
    return '*' + escaped.split('').join('*') + '*'
  }

  /**
   * Greedy substring match: check if all characters in query can be matched
   * by finding consecutive substrings in text (not necessarily single chars)
   * e.g., "updatercontroller" matches "updateController" by:
   *   "update" + "r" (from Controller) + "controller"
   */
  private isGreedySubstringMatch(text: string, query: string): boolean {
    const textLower = text.toLowerCase()
    const queryLower = query.toLowerCase()

    let queryIndex = 0
    let searchStart = 0

    while (queryIndex < queryLower.length) {
      // Try to find the longest matching substring starting at queryIndex
      let bestMatchLen = 0
      let bestMatchPos = -1

      for (let len = queryLower.length - queryIndex; len >= 1; len--) {
        const substr = queryLower.slice(queryIndex, queryIndex + len)
        const foundAt = textLower.indexOf(substr, searchStart)
        if (foundAt !== -1) {
          bestMatchLen = len
          bestMatchPos = foundAt
          break // Found longest possible match
        }
      }

      if (bestMatchLen === 0) {
        // No substring match found, query cannot be matched
        return false
      }

      queryIndex += bestMatchLen
      searchStart = bestMatchPos + bestMatchLen
    }

    return true
  }

  /**
   * Calculate greedy substring match score (higher is better)
   * Rewards: fewer match fragments, shorter match span, matches in filename
   */
  private getGreedyMatchScore(filePath: string, query: string): number {
    const textLower = filePath.toLowerCase()
    const queryLower = query.toLowerCase()
    const fileName = filePath.split('/').pop() || ''
    const fileNameLower = fileName.toLowerCase()

    let queryIndex = 0
    let searchStart = 0
    let fragmentCount = 0
    let firstMatchPos = -1
    let lastMatchEnd = 0

    while (queryIndex < queryLower.length) {
      let bestMatchLen = 0
      let bestMatchPos = -1

      for (let len = queryLower.length - queryIndex; len >= 1; len--) {
        const substr = queryLower.slice(queryIndex, queryIndex + len)
        const foundAt = textLower.indexOf(substr, searchStart)
        if (foundAt !== -1) {
          bestMatchLen = len
          bestMatchPos = foundAt
          break
        }
      }

      if (bestMatchLen === 0) {
        return -Infinity // No match
      }

      fragmentCount++
      if (firstMatchPos === -1) firstMatchPos = bestMatchPos
      lastMatchEnd = bestMatchPos + bestMatchLen
      queryIndex += bestMatchLen
      searchStart = lastMatchEnd
    }

    const matchSpan = lastMatchEnd - firstMatchPos
    let score = 0

    // Fewer fragments = better (single continuous match is best)
    // Max bonus when fragmentCount=1, decreases as fragments increase
    score += Math.max(0, 100 - (fragmentCount - 1) * 30)

    // Shorter span relative to query length = better (tighter match)
    // Perfect match: span equals query length
    const spanRatio = queryLower.length / matchSpan
    score += spanRatio * 50

    // Bonus for match in filename
    if (this.isGreedySubstringMatch(fileNameLower, queryLower)) {
      score += 80
    }

    // Penalty for longer paths
    score -= Math.log(filePath.length + 1) * 4

    return score
  }

  /**
   * Build common ripgrep arguments for file listing
   */
  private buildRipgrepBaseArgs(options: Required<DirectoryListOptions>, resolvedPath: string): string[] {
    const args: string[] = ['--files']

    // Handle hidden files
    if (!options.includeHidden) {
      args.push('--glob', '!.*')
    }

    // Exclude common hidden directories and large directories
    args.push(...COMMON_RIPGREP_EXCLUDES)

    // Handle max depth
    if (!options.recursive) {
      args.push('--max-depth', '1')
    } else if (options.maxDepth > 0) {
      args.push('--max-depth', options.maxDepth.toString())
    }

    args.push(resolvedPath)

    return args
  }

  private async listDirectoryWithRipgrep(
    resolvedPath: string,
    options: Required<DirectoryListOptions>
  ): Promise<string[]> {
    // Fuzzy search mode: use ripgrep glob for pre-filtering, then score in JS
    if (options.fuzzy && options.searchPattern && options.searchPattern !== '.') {
      const args = this.buildRipgrepBaseArgs(options, resolvedPath)

      // Insert glob pattern before the path (last element)
      const globPattern = this.queryToGlobPattern(options.searchPattern)
      args.splice(args.length - 1, 0, '--iglob', globPattern)

      const { exitCode, output } = await executeRipgrep(args)

      if (exitCode >= 2) {
        throw new Error(`Ripgrep failed with exit code ${exitCode}: ${output}`)
      }

      const filteredFiles = output
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.replace(/\\/g, '/'))

      // If fuzzy glob found results, validate fuzzy match, sort and return
      if (filteredFiles.length > 0) {
        return filteredFiles
          .filter((file) => this.isFuzzyMatch(file, options.searchPattern))
          .map((file) => ({ file, score: this.getFuzzyMatchScore(file, options.searchPattern) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, options.maxEntries)
          .map((item) => item.file)
      }

      // Fallback: if no results, try greedy substring match on all files
      logger.debug('Fuzzy glob returned no results, falling back to greedy substring match')
      const fallbackArgs = this.buildRipgrepBaseArgs(options, resolvedPath)

      const fallbackResult = await executeRipgrep(fallbackArgs)

      if (fallbackResult.exitCode >= 2) {
        return []
      }

      const allFiles = fallbackResult.output
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.replace(/\\/g, '/'))

      const greedyMatched = allFiles.filter((file) => this.isGreedySubstringMatch(file, options.searchPattern))

      return greedyMatched
        .map((file) => ({ file, score: this.getGreedyMatchScore(file, options.searchPattern) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, options.maxEntries)
        .map((item) => item.file)
    }

    // Fallback: search by filename only (non-fuzzy mode)
    logger.debug('Searching by filename pattern', { pattern: options.searchPattern, path: resolvedPath })
    const filenameResults = await this.searchByFilename(resolvedPath, options)

    logger.debug('Found matches by filename', { count: filenameResults.length })
    return filenameResults.slice(0, options.maxEntries)
  }

  public save = async (
    _: Electron.IpcMainInvokeEvent,
    fileName: string,
    content: string,
    options?: SaveDialogOptions
  ): Promise<string> => {
    try {
      const result: SaveDialogReturnValue = await dialog.showSaveDialog({
        title: t('dialog.save_file'),
        defaultPath: fileName,
        ...options
      })

      if (result.canceled) {
        return Promise.reject(new Error('User canceled the save dialog'))
      }

      if (!result.canceled && result.filePath) {
        writeFileSync(result.filePath, content, { encoding: 'utf-8' })
      }

      return result.filePath
    } catch (err: any) {
      logger.error('[IPC - Error] An error occurred saving the file:', err as Error)
      return Promise.reject('An error occurred saving the file: ' + err?.message)
    }
  }

  public saveImage = async (_: Electron.IpcMainInvokeEvent, name: string, data: string): Promise<boolean> => {
    try {
      const filePath = dialog.showSaveDialogSync({
        defaultPath: `${name}.png`,
        filters: [{ name: t('dialog.png_image'), extensions: ['png'] }]
      })

      if (filePath) {
        const parseResult = parseDataUrl(data)
        fs.writeFileSync(filePath, parseResult?.data ?? data, 'base64')
        return true
      }
    } catch (error) {
      logger.error('[IPC - Error] An error occurred saving the image:', error as Error)
    }
    return false
  }

  /**
   * 通用「另存为」：不限定文件类型（如视频、音频），按调用方提供的完整文件名弹系统保存框。
   * 与 saveImage 的区别：defaultPath 不追加 .png，过滤器含具体类型 + All Files 兜底。
   */
  public saveFileAs = async (_: Electron.IpcMainInvokeEvent, name: string, base64Data: string): Promise<boolean> => {
    try {
      const ext = path.extname(name).replace('.', '') || '*'
      const filePath = dialog.showSaveDialogSync({
        defaultPath: name,
        filters: [
          { name: ext.toUpperCase(), extensions: [ext] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (filePath) {
        const parseResult = parseDataUrl(base64Data)
        fs.writeFileSync(filePath, parseResult?.data ?? base64Data, 'base64')
        return true
      }
    } catch (error) {
      logger.error('[IPC - Error] An error occurred saving the file:', error as Error)
    }
    return false
  }

  public selectFolder = async (_: Electron.IpcMainInvokeEvent, options: OpenDialogOptions): Promise<string | null> => {
    try {
      const result: OpenDialogReturnValue = await dialog.showOpenDialog({
        title: t('dialog.select_folder'),
        properties: ['openDirectory'],
        ...options
      })

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0]
      }

      return null
    } catch (err) {
      logger.error('[IPC - Error] An error occurred selecting the folder:', err as Error)
      return null
    }
  }

  public downloadFile = async (
    _: Electron.IpcMainInvokeEvent,
    url: string,
    isUseContentType?: boolean
  ): Promise<FileMetadata> => {
    try {
      // SSRF hardening: only http/https URLs may be downloaded, and the final
      // URL after redirects must stay within those schemes as well.
      if (!isAllowedDownloadUrl(url)) {
        throw new Error('Blocked download: only http/https URLs are allowed')
      }

      const response = await net.fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (response.url && !isAllowedDownloadUrl(response.url)) {
        throw new Error('Blocked download: redirect to a non-http(s) URL')
      }

      // 尝试从Content-Disposition获取文件名
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'download'

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      // 如果URL中有文件名，使用URL中的文件名
      const urlFilename = url.split('/').pop()?.split('?')[0]
      if (urlFilename && urlFilename.includes('.')) {
        filename = urlFilename
      }

      // 如果文件名没有后缀，根据Content-Type添加后缀
      if (isUseContentType || !filename.includes('.')) {
        const contentType = response.headers.get('Content-Type')
        const ext = this.getExtensionFromMimeType(contentType)
        filename += ext
      }

      const uuid = crypto.randomUUID()
      const ext = path.extname(filename)
      const destPath = path.join(this.storageDir, uuid + ext)

      // Stream the response to disk with a hard size cap, so a huge (or
      // maliciously served) file cannot exhaust memory or fill the disk.
      const contentLength = Number(response.headers.get('Content-Length') ?? '0')
      if (contentLength > MAX_DOWNLOAD_BYTES) {
        throw new Error(`Download exceeds the maximum allowed size (${MAX_DOWNLOAD_BYTES / MB} MB)`)
      }

      if (response.body) {
        const writeStream = fs.createWriteStream(destPath)
        let total = 0
        // 流错误必须有监听，否则 destroy(err) 触发 unhandled 'error' 事件使主进程崩溃。
        // 注意：destroy(err) 的 'error' 事件在下一个 tick 才发出，必须等流真正 close 后才能移除监听，
        // 否则 finally 里同步 removeListener 会让事件落到无监听状态（1.2.1 修复因此失效）。
        let drainWaiter: { resolve: () => void; reject: (err: Error) => void } | null = null
        const onStreamError = (err: Error) => {
          logger.error('downloadFile stream error:', err)
          drainWaiter?.reject(err)
          drainWaiter = null
          fs.promises.unlink(destPath).catch(() => {})
        }
        writeStream.on('error', onStreamError)
        writeStream.once('close', () => writeStream.removeListener('error', onStreamError))
        try {
          for await (const chunk of response.body) {
            total += chunk.byteLength
            if (total > MAX_DOWNLOAD_BYTES) {
              writeStream.destroy(new Error('Download exceeds the maximum allowed size'))
              throw new Error(`Download exceeds the maximum allowed size (${MAX_DOWNLOAD_BYTES / MB} MB)`)
            }
            if (!writeStream.write(Buffer.from(chunk))) {
              await new Promise<void>((resolve, reject) => {
                drainWaiter = { resolve, reject }
                writeStream.once('drain', () => {
                  drainWaiter = null
                  resolve()
                })
              })
            }
          }
        } finally {
          writeStream.end()
        }
      }

      const stats = await fs.promises.stat(destPath)
      const fileType = await this.getFileType(destPath)

      return {
        id: uuid,
        origin_name: filename,
        name: uuid + ext,
        path: destPath,
        created_at: stats.birthtime.toISOString(),
        size: stats.size,
        ext: ext,
        type: fileType,
        count: 1
      }
    } catch (error) {
      logger.error('Download file error:', error as Error)
      throw error
    }
  }

  private getExtensionFromMimeType(mimeType: string | null): string {
    if (!mimeType) return '.bin'

    const mimeToExtension: { [key: string]: string } = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/bmp': '.bmp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/html': '.html',
      'text/markdown': '.md',
      'application/json': '.json',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/zip': '.zip',
      'application/x-zip-compressed': '.zip',
      // 音视频（对象存储对媒体文件常返回 application/octet-stream 之外的这些类型）
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'video/x-matroska': '.mkv',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/x-wav': '.wav',
      'audio/mp4': '.m4a',
      'audio/aac': '.aac'
    }

    return mimeToExtension[mimeType] || '.bin'
  }

  public writeFileWithId = async (_: Electron.IpcMainInvokeEvent, id: string, content: string): Promise<void> => {
    try {
      const filePath = this.resolveStoragePath(id)
      logger.debug(`Writing file: ${filePath}`)

      // 确保目录存在
      if (!fs.existsSync(this.storageDir)) {
        logger.debug(`Creating storage directory: ${this.storageDir}`)
        fs.mkdirSync(this.storageDir, { recursive: true })
      }

      await fs.promises.writeFile(filePath, content, 'utf8')
      logger.debug(`File written successfully: ${filePath}`)
    } catch (error) {
      logger.error('Failed to write file:', error as Error)
      throw error
    }
  }

  public startFileWatcher = async (
    event: Electron.IpcMainInvokeEvent,
    dirPath: string,
    config?: FileWatcherConfig
  ): Promise<void> => {
    try {
      this.watcherConfig = { ...DEFAULT_WATCHER_CONFIG, ...config }

      if (!dirPath?.trim()) {
        throw new Error('Directory path is required')
      }

      const normalizedPath = path.resolve(dirPath.trim())

      if (!fs.existsSync(normalizedPath)) {
        throw new Error(`Directory does not exist: ${normalizedPath}`)
      }

      const stats = fs.statSync(normalizedPath)
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${normalizedPath}`)
      }

      if (this.currentWatchPath === normalizedPath && this.watcher) {
        this.watcherSender = event.sender
        logger.debug('Already watching directory, updated sender', { path: normalizedPath })
        return
      }

      await this.stopFileWatcher()

      logger.info('Starting file watcher', {
        path: normalizedPath,
        config: {
          extensions: this.watcherConfig.watchExtensions,
          debounceMs: this.watcherConfig.debounceMs,
          maxDepth: this.watcherConfig.maxDepth
        }
      })

      this.currentWatchPath = normalizedPath
      this.watcherSender = event.sender

      const watchOptions = {
        ignored: this.watcherConfig.ignoredPatterns,
        persistent: true,
        ignoreInitial: true,
        depth: this.watcherConfig.maxDepth,
        usePolling: this.watcherConfig.usePolling,
        awaitWriteFinish: {
          stabilityThreshold: this.watcherConfig.stabilityThreshold,
          pollInterval: 100
        },
        alwaysStat: false,
        atomic: true
      }

      this.watcher = chokidar.watch(normalizedPath, watchOptions)

      const handleChange = this.createChangeHandler()

      this.watcher
        .on('add', (filePath: string) => handleChange('add', filePath))
        .on('unlink', (filePath: string) => handleChange('unlink', filePath))
        .on('addDir', (dirPath: string) => handleChange('addDir', dirPath))
        .on('unlinkDir', (dirPath: string) => handleChange('unlinkDir', dirPath))
        .on('error', (error: unknown) => {
          logger.error('File watcher error', { error: error as Error, path: normalizedPath })
          if (this.watcherConfig.retryOnError) {
            this.handleWatcherError(error as Error)
          }
        })
        .on('ready', () => {
          logger.debug('File watcher ready', { path: normalizedPath })
        })

      logger.info('File watcher started successfully')
    } catch (error) {
      logger.error('Failed to start file watcher', error as Error)
      this.cleanup()
      throw error
    }
  }

  private createChangeHandler() {
    return (eventType: string, filePath: string) => {
      if (!this.shouldWatchFile(filePath, eventType)) {
        return
      }

      logger.debug('File change detected', { eventType, filePath, path: this.currentWatchPath })

      // 对于目录操作，立即触发同步，不使用防抖
      if (eventType === 'addDir' || eventType === 'unlinkDir') {
        logger.debug('Directory operation detected, triggering immediate sync', { eventType, filePath })
        this.notifyChange(eventType, filePath)
        return
      }

      // 对于文件操作，使用防抖机制
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }

      this.debounceTimer = setTimeout(() => {
        this.notifyChange(eventType, filePath)
        this.debounceTimer = undefined
      }, this.watcherConfig.debounceMs)
    }
  }

  private shouldWatchFile(filePath: string, eventType: string): boolean {
    if (eventType.includes('Dir')) {
      return true
    }

    const ext = path.extname(filePath).toLowerCase()
    return this.watcherConfig.watchExtensions.includes(ext)
  }

  private notifyChange(eventType: string, filePath: string) {
    try {
      if (!this.watcherSender || this.watcherSender.isDestroyed()) {
        logger.warn('Sender destroyed, stopping watcher')
        void this.stopFileWatcher()
        return
      }

      logger.debug('Sending file change event', {
        eventType,
        filePath,
        channel: this.watcherConfig.eventChannel,
        senderExists: !!this.watcherSender,
        senderDestroyed: this.watcherSender.isDestroyed()
      })
      this.watcherSender.send(this.watcherConfig.eventChannel, {
        eventType,
        filePath,
        watchPath: this.currentWatchPath
      })
      logger.debug('File change event sent successfully')
    } catch (error) {
      logger.error('Failed to send notification', error as Error)
    }
  }

  private handleWatcherError(error: Error) {
    const retryableErrors = ['EMFILE', 'ENFILE', 'ENOSPC']
    const isRetryable = retryableErrors.some((code) => error.message.includes(code))

    if (isRetryable && this.currentWatchPath && this.watcherSender && !this.watcherSender.isDestroyed()) {
      logger.warn('Attempting restart due to recoverable error', { error: error.message })

      setTimeout(async () => {
        try {
          if (this.currentWatchPath && this.watcherSender && !this.watcherSender.isDestroyed()) {
            const mockEvent = { sender: this.watcherSender } as Electron.IpcMainInvokeEvent
            await this.startFileWatcher(mockEvent, this.currentWatchPath, this.watcherConfig)
          }
        } catch (retryError) {
          logger.error('Restart failed', retryError as Error)
        }
      }, this.watcherConfig.retryDelayMs)
    }
  }

  private cleanup() {
    this.currentWatchPath = undefined
    this.watcherSender = undefined
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
  }

  public stopFileWatcher = async (): Promise<void> => {
    try {
      if (this.watcher) {
        logger.info('Stopping file watcher', { path: this.currentWatchPath })
        await this.watcher.close()
        this.watcher = undefined
        logger.debug('File watcher stopped')
      }
      this.cleanup()
    } catch (error) {
      logger.error('Failed to stop file watcher', error as Error)
      this.watcher = undefined
      this.cleanup()
    }
  }

  public getFilePathById(file: FileMetadata): string {
    // Validate so a crafted file.id (e.g. "../secret") cannot escape storageDir.
    return this.resolveStoragePath(file.id + file.ext)
  }

  public isTextFile = async (_: Electron.IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    return this._isTextFile(filePath)
  }

  private _isTextFile = async (filePath: string): Promise<boolean> => {
    try {
      const isBinary = await isBinaryFile(filePath)
      if (isBinary) {
        return false
      }

      const length = 8 * KB
      const fileHandle = await fs.promises.open(filePath, 'r')
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await fileHandle.read(buffer, 0, length, 0)
      await fileHandle.close()

      const sampleBuffer = buffer.subarray(0, bytesRead)
      const matches = chardet.analyse(sampleBuffer)

      // 如果检测到的编码置信度较高，认为是文本文件
      if (matches.length > 0 && matches[0].confidence > 0.8) {
        return true
      }

      return false
    } catch (error) {
      logger.error('Failed to check if file is text:', error as Error)
      return false
    }
  }

  public isDirectory = async (_: Electron.IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    try {
      const stat = await fs.promises.stat(filePath)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  public showInFolder = async (_: Electron.IpcMainInvokeEvent, path: string): Promise<void> => {
    if (!fs.existsSync(path)) {
      const msg = `File or folder does not exist: ${path}`
      logger.error(msg)
      throw new Error(msg)
    }
    try {
      shell.showItemInFolder(path)
    } catch (error) {
      logger.error('Failed to show item in folder:', error as Error)
    }
  }
}

export const fileStorage = new FileStorage()
