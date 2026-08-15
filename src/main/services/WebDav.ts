import { loggerService } from '@logger'
import type { WebDavConfig } from '@types'
import https from 'https'
import path from 'path'
import type Stream from 'stream'
import type {
  BufferLike,
  CreateDirectoryOptions,
  GetFileContentsOptions,
  PutFileContentsOptions,
  WebDAVClient
} from 'webdav'
import { createClient } from 'webdav'

const logger = loggerService.withContext('WebDav')

export default class WebDav {
  public instance: WebDAVClient | undefined
  private webdavPath: string

  constructor(params: WebDavConfig) {
    this.webdavPath = params.webdavPath || '/'

    this.instance = createClient(params.webdavHost, {
      username: params.webdavUser,
      password: params.webdavPass,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      // TLS verification must stay enabled; disabling it lets any
      // man-in-the-middle read the WebDAV credentials in transit.
      httpsAgent: params.allowSelfSignedCertificate
        ? new https.Agent({ rejectUnauthorized: false })
        : new https.Agent({ rejectUnauthorized: true })
    })

    this.putFileContents = this.putFileContents.bind(this)
    this.getFileContents = this.getFileContents.bind(this)
    this.createDirectory = this.createDirectory.bind(this)
    this.deleteFile = this.deleteFile.bind(this)
  }

  /**
   * Resolve a remote file path under webdavPath, rejecting entries that would
   * escape it (`..` segments, absolute paths).
   */
  private resolveRemotePath(filename: string): string {
    const segments = filename.split('/')
    if (segments.includes('..') || filename.startsWith('/')) {
      throw new Error(`Unsafe WebDAV path: ${filename}`)
    }
    return path.posix.join(this.webdavPath, filename)
  }

  public putFileContents = async (
    filename: string,
    data: string | BufferLike | Stream.Readable,
    options?: PutFileContentsOptions
  ) => {
    if (!this.instance) {
      return new Error('WebDAV client not initialized')
    }

    try {
      if (!(await this.instance.exists(this.webdavPath))) {
        await this.instance.createDirectory(this.webdavPath, {
          recursive: true
        })
      }
    } catch (error) {
      logger.error('Error creating directory on WebDAV:', error as Error)
      throw error
    }

    const remoteFilePath = this.resolveRemotePath(filename)

    try {
      return await this.instance.putFileContents(remoteFilePath, data, options)
    } catch (error) {
      logger.error('Error putting file contents on WebDAV:', error as Error)
      throw error
    }
  }

  public getFileContents = async (filename: string, options?: GetFileContentsOptions) => {
    if (!this.instance) {
      throw new Error('WebDAV client not initialized')
    }

    const remoteFilePath = this.resolveRemotePath(filename)

    try {
      return await this.instance.getFileContents(remoteFilePath, options)
    } catch (error) {
      logger.error('Error getting file contents on WebDAV:', error as Error)
      throw error
    }
  }

  public getDirectoryContents = async () => {
    if (!this.instance) {
      throw new Error('WebDAV client not initialized')
    }

    try {
      return await this.instance.getDirectoryContents(this.webdavPath)
    } catch (error) {
      logger.error('Error getting directory contents on WebDAV:', error as Error)
      throw error
    }
  }

  public checkConnection = async () => {
    if (!this.instance) {
      throw new Error('WebDAV client not initialized')
    }

    try {
      return await this.instance.exists('/')
    } catch (error) {
      logger.error('Error checking connection:', error as Error)
      throw error
    }
  }

  public createDirectory = async (path: string, options?: CreateDirectoryOptions) => {
    if (!this.instance) {
      throw new Error('WebDAV client not initialized')
    }

    try {
      return await this.instance.createDirectory(path, options)
    } catch (error) {
      logger.error('Error creating directory on WebDAV:', error as Error)
      throw error
    }
  }

  public deleteFile = async (filename: string) => {
    if (!this.instance) {
      throw new Error('WebDAV client not initialized')
    }

    const remoteFilePath = this.resolveRemotePath(filename)

    try {
      return await this.instance.deleteFile(remoteFilePath)
    } catch (error) {
      logger.error('Error deleting file on WebDAV:', error as Error)
      throw error
    }
  }
}
