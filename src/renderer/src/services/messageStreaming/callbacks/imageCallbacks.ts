import { loggerService } from '@logger'
import FileManager from '@renderer/services/FileManager'
import type { GenerateImageResponse } from '@renderer/types'
import type { ImageMessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { createImageBlock } from '@renderer/utils/messageUtils/create'

import type { BlockManager } from '../BlockManager'

const logger = loggerService.withContext('ImageCallbacks')

interface ImageCallbacksDependencies {
  blockManager: BlockManager
  assistantMsgId: string
}

export const createImageCallbacks = (deps: ImageCallbacksDependencies) => {
  const { blockManager, assistantMsgId } = deps

  // 内部维护的状态
  let imageBlockId: string | null = null

  return {
    onImageCreated: async () => {
      if (blockManager.hasInitialPlaceholder) {
        const initialChanges = {
          type: MessageBlockType.IMAGE,
          status: MessageBlockStatus.PENDING
        }
        imageBlockId = blockManager.initialPlaceholderBlockId!
        blockManager.smartBlockUpdate(imageBlockId, initialChanges, MessageBlockType.IMAGE)
      } else if (!imageBlockId) {
        const imageBlock = createImageBlock(assistantMsgId, {
          status: MessageBlockStatus.PENDING
        })
        imageBlockId = imageBlock.id
        await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
      }
    },

    onImageDelta: (imageData: GenerateImageResponse) => {
      const imageUrl = imageData.images?.[0] || 'placeholder_image_url'
      if (imageBlockId) {
        const changes: Partial<ImageMessageBlock> = {
          url: imageUrl,
          metadata: { generateImageResponse: imageData },
          status: MessageBlockStatus.STREAMING
        }
        blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE, true)
      }
    },

    onImageGenerated: async (imageData?: GenerateImageResponse) => {
      // For base64 images, persist to disk to avoid sending huge data URIs in future messages
      const buildImageBlockFields = async (imageData: GenerateImageResponse): Promise<Partial<ImageMessageBlock>> => {
        const imageUrl: string = imageData.images?.[0] || 'placeholder_image_url'
        if (imageData.type === 'base64' && imageUrl.startsWith('data:')) {
          const savedFile = await window.api.file.saveBase64Image(imageUrl)
          await FileManager.addFile(savedFile)
          return {
            file: savedFile,
            url: FileManager.getFileUrl(savedFile),
            metadata: { generateImageResponse: imageData },
            status: MessageBlockStatus.SUCCESS
          }
        }
        // 远程 URL（如百炼 OSS）有效期通常仅 24 小时，下载到内部存储持久化，
        // 历史展示改用本地 URL，避免链接过期后聊天记录裂图；单张下载失败回退原 URL
        if (imageData.type === 'url' && imageData.images?.some((img) => img.startsWith('http'))) {
          const results = await Promise.all(
            imageData.images.map(async (img) => {
              if (!img.startsWith('http')) {
                return { localUrl: img, file: undefined }
              }
              try {
                const savedFile = await window.api.file.download(img, true)
                await FileManager.addFile(savedFile)
                return { localUrl: FileManager.getFileUrl(savedFile), file: savedFile }
              } catch (error) {
                logger.warn('远程图片下载失败，保留原 URL 展示:', { url: img.slice(0, 60), error: error as Error })
                return { localUrl: img, file: undefined }
              }
            })
          )
          const files = results.filter((result) => result.file !== undefined).map((result) => result.file!)
          if (files.length > 0) {
            return {
              file: files[0],
              url: FileManager.getFileUrl(files[0]),
              metadata: {
                generateImageResponse: { type: 'url', images: results.map((result) => result.localUrl) },
                ...(files.length > 0 ? { generatedFiles: files } : {})
              },
              status: MessageBlockStatus.SUCCESS
            }
          }
        }
        return {
          url: imageUrl,
          metadata: { generateImageResponse: imageData },
          status: MessageBlockStatus.SUCCESS
        }
      }

      if (!imageBlockId && blockManager.hasInitialPlaceholder) {
        imageBlockId = blockManager.initialPlaceholderBlockId
      }

      if (imageBlockId) {
        if (!imageData) {
          const changes: Partial<ImageMessageBlock> = {
            status: MessageBlockStatus.SUCCESS
          }
          blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE, true)
        } else {
          const changes = {
            type: MessageBlockType.IMAGE,
            ...(await buildImageBlockFields(imageData))
          }
          blockManager.smartBlockUpdate(imageBlockId, changes, MessageBlockType.IMAGE, true)
        }
        imageBlockId = null
      } else {
        if (imageData) {
          const fields = await buildImageBlockFields(imageData)
          const imageBlock = createImageBlock(assistantMsgId, fields)
          await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
        } else {
          logger.error('[onImageGenerated] Last block was not an Image block or ID is missing.')
        }
      }
    },

    onImageSearched: async (content: string, metadata: Record<string, any>) => {
      if (!imageBlockId) {
        const imageBlock = createImageBlock(assistantMsgId, {
          status: MessageBlockStatus.SUCCESS,
          metadata: {
            generateImageResponse: {
              type: 'base64',
              images: [`data:${metadata.mime};base64,${content}`]
            }
          }
        })
        await blockManager.handleBlockTransition(imageBlock, MessageBlockType.IMAGE)
      }
    }
  }
}
