import type { FileListResponse, FileMetadata, FileUploadResponse, Provider } from '@types'

export abstract class BaseFileService {
  protected readonly provider: Provider
  protected constructor(provider: Provider) {
    this.provider = provider
  }

  protected failedResponse(fileId: string, displayName: string): FileUploadResponse {
    return { fileId, displayName, status: 'failed', originalFile: undefined }
  }

  abstract uploadFile(file: FileMetadata): Promise<FileUploadResponse>
  abstract deleteFile(fileId: string): Promise<void>
  abstract listFiles(): Promise<FileListResponse>
  abstract retrieveFile(fileId: string): Promise<FileUploadResponse>
}
