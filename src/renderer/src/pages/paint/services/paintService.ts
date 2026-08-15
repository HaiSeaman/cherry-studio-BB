import { loggerService } from '@logger'
import { PAINT_ENHANCE_PROMPT } from '@renderer/config/paint'
import { db } from '@renderer/databases'
import { TopicManager } from '@renderer/hooks/useTopic'
import { fetchChatCompletion } from '@renderer/services/ApiService'
import { getDefaultAssistant, getTranslateModel } from '@renderer/services/AssistantService'
import { dbService } from '@renderer/services/db'
import { getModelUniqId } from '@renderer/services/ModelService'
import store from '@renderer/store'
import type { Assistant, Model } from '@renderer/types'
import { TopicType } from '@renderer/types'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'
import type { SerializedError } from '@renderer/types/error'
import type { ResponseError } from '@renderer/types/newMessage'
import { AssistantMessageStatus, MessageBlockStatus } from '@renderer/types/newMessage'
import { uuid } from '@renderer/utils'
import { getErrorMessage, isAbortError } from '@renderer/utils/error'
import {
  createAssistantMessage,
  createImageBlock,
  createMainTextBlock,
  createMessage
} from '@renderer/utils/messageUtils/create'
import { NoOutputGeneratedError } from 'ai'

import { fetchPaintGeneration } from './fetchPaintGeneration'

const logger = loggerService.withContext('PaintService')

// 当前生成任务的中止控制器（模块级：输入区生成与气泡编辑重生成共用）
let activeAbortController: AbortController | null = null

/** 中止当前正在进行的图片生成（点击「停止生成」时调用） */
export function abortCurrentGeneration(): void {
  activeAbortController?.abort()
}

/** 绘画会话在 db.topics 表中的行结构 */
export type PaintTopic = {
  id: string
  name: string
  type: 'paint'
  updatedAt: string
  createdAt?: string
}

/**
 * 一键优化提示词：使用「翻译模型」将用户描述扩写为高质量绘画提示词
 * @param prompt 用户输入的描述
 * @returns 优化后的提示词
 * @throws 翻译模型未配置 / 优化失败 / 结果为空
 */
export async function enhancePrompt(prompt: string): Promise<string> {
  const model = getTranslateModel()
  if (!model) {
    throw new Error('翻译模型未配置，请先在设置中配置')
  }

  const assistant = {
    ...getDefaultAssistant(),
    model
  } satisfies Assistant

  let optimizedText = ''
  let error: ResponseError | undefined
  const onChunk = (chunk: Chunk) => {
    if (chunk.type === ChunkType.TEXT_DELTA) {
      optimizedText = chunk.text
    } else if (chunk.type === ChunkType.TEXT_COMPLETE) {
      // noop
    } else if (chunk.type === ChunkType.ERROR) {
      error = chunk.error
    }
  }

  try {
    await fetchChatCompletion({
      prompt: `${PAINT_ENHANCE_PROMPT}\n\n${prompt}`,
      assistant,
      onChunkReceived: onChunk
    })
  } catch (e) {
    // 忽略中止产生的 no output 错误
    if (!NoOutputGeneratedError.isInstance(e)) {
      throw e
    }
  }

  if (error !== undefined && !isAbortError(error)) {
    throw error
  }

  const trimmedText = optimizedText.trim()
  if (!trimmedText) {
    throw new Error('提示词优化结果为空')
  }

  return trimmedText
}

/** 创建新的绘画会话，返回话题 id */
export async function createPaintTopic(): Promise<string> {
  const id = uuid()
  const now = new Date().toISOString()
  await db.topics.add({
    id,
    messages: [],
    type: TopicType.Paint,
    name: '新的绘画会话',
    updatedAt: now
  })
  return id
}

/** 重命名绘画会话 */
export async function renamePaintTopic(id: string, name: string): Promise<void> {
  await db.topics.update(id, { name, updatedAt: new Date().toISOString() })
}

/** 删除绘画会话（连带消息块与文件清理，复用聊天话题删除逻辑） */
export async function deletePaintTopic(id: string): Promise<void> {
  await TopicManager.removeTopic(id)
}

/** 获取当前设置的图片保存路径（空 = 使用默认目录 用户图片目录/CherryStudio） */
export function getImageSavePath(): string {
  return store.getState().settings.imageSavePath
}

/**
 * 将生成的图片自动保存到用户设置的目录
 * 保存失败不抛出（静默降级），历史记录仍保留在应用内部存储
 */
export async function saveGeneratedImages(images: string[]): Promise<void> {
  const savePath = getImageSavePath()

  for (const image of images) {
    try {
      if (image.startsWith('data:')) {
        // base64 直存
        await window.api.file.saveImageToDirectory(image, savePath)
      } else if (image.startsWith('file://')) {
        // 内部存储文件，跳过（历史展示已依赖内部路径）
        continue
      } else {
        // 远程 URL：下载后转 base64 再保存
        const blob = await fetch(image).then((r) => {
          if (!r.ok) {
            throw new Error(`下载图片失败: ${r.status}`)
          }
          return r.blob()
        })
        const dataUrl = await blobToDataUrl(blob)
        await window.api.file.saveImageToDirectory(dataUrl, savePath)
      }
    } catch (error) {
      logger.warn('自动保存图片失败（不影响历史记录）:', { image: image.slice(0, 50), error: error as Error })
    }
  }
}

/** Blob → data URL */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/** 生成参数（正常生成 / 重新生成 / 编辑重生成共用） */
export type GeneratePaintImageParams = {
  model: Model
  prompt: string
  inputImages?: string[]
  imageSize: string
  aspectRatio?: string
  personGeneration?: string
  batchSize: number
  /** 目标会话 id；为空时自动创建新会话 */
  topicId?: string | null
  /** 中止信号（点击「停止生成」时触发） */
  signal?: AbortSignal
}

export type GeneratePaintImageResult = {
  topicId: string
  images: string[]
}

/**
 * 统一的图片生成流程：
 * 1. 确定会话（无则创建）
 * 2. 写入用户提示词消息 + 助手 PENDING 图片消息
 * 3. 调用 fetchPaintGeneration 生成
 * 4. 更新图片块状态 + 自动保存
 * 失败时图片块标记 ERROR 并上抛错误（由调用方提示）
 */
export async function generatePaintImage(params: GeneratePaintImageParams): Promise<GeneratePaintImageResult> {
  const {
    model,
    prompt,
    inputImages = [],
    imageSize,
    aspectRatio,
    personGeneration,
    batchSize,
    topicId,
    signal
  } = params

  // 本次生成的中止控制器（供「停止生成」按钮中止；调用方传入 signal 时优先使用调用方的）
  const controller = signal ? null : new AbortController()
  const effectiveSignal = signal ?? controller?.signal
  if (controller) {
    activeAbortController = controller
  }

  let targetTopicId = topicId ?? null
  if (!targetTopicId) {
    targetTopicId = await createPaintTopic()
  }
  const currentTopicId = targetTopicId

  // 用户提示词消息
  const userMessage = createMessage('user', currentTopicId, 'paint')
  const userBlock = createMainTextBlock(userMessage.id, prompt)
  userMessage.blocks = [userBlock.id]

  // 助手图片消息（PENDING，生成完成后更新为 SUCCESS）
  const assistantMessage = createAssistantMessage('paint', currentTopicId, { model, modelId: model.id })
  const imageBlock = createImageBlock(assistantMessage.id, { status: MessageBlockStatus.PENDING })
  assistantMessage.blocks = [imageBlock.id]

  await dbService.appendMessage(currentTopicId, userMessage, [userBlock])
  await dbService.appendMessage(currentTopicId, assistantMessage, [imageBlock])
  await db.topics.update(currentTopicId, { updatedAt: new Date().toISOString() })

  // 首次生成时用提示词命名会话
  const topicRow = await db.topics.get(currentTopicId)
  if (topicRow && (!topicRow.name || topicRow.name === '新的绘画会话')) {
    await db.topics.update(currentTopicId, {
      name: prompt.slice(0, 20),
      updatedAt: new Date().toISOString()
    })
  }

  try {
    const images = await fetchPaintGeneration({
      model,
      prompt,
      inputImages,
      imageSize,
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(personGeneration ? { personGeneration } : {}),
      batchSize,
      ...(effectiveSignal ? { signal: effectiveSignal } : {}),
      onChunkReceived: async (chunk: Chunk) => {
        // 生成期间用户可能删除会话导致块不存在，更新失败需静默忽略
        try {
          if (chunk.type === ChunkType.IMAGE_COMPLETE && chunk.image) {
            await db.message_blocks.update(imageBlock.id, {
              status: MessageBlockStatus.SUCCESS,
              metadata: { generateImageResponse: chunk.image }
            })
            await dbService.updateMessage(currentTopicId, assistantMessage.id, {
              status: AssistantMessageStatus.SUCCESS
            })
            // 自动保存到用户设置目录（失败静默，不影响历史记录）
            void saveGeneratedImages(chunk.image.images)
          } else if (chunk.type === ChunkType.ERROR) {
            await db.message_blocks.update(imageBlock.id, {
              status: MessageBlockStatus.ERROR,
              error: toSerializedError(chunk.error)
            })
            await dbService.updateMessage(currentTopicId, assistantMessage.id, {
              status: AssistantMessageStatus.ERROR
            })
          }
        } catch {
          // 会话已被删除等场景，忽略块更新失败
        }
      }
    })

    return { topicId: currentTopicId, images }
  } catch (error) {
    logger.error('图片生成失败:', error as Error)
    try {
      await db.message_blocks.update(imageBlock.id, {
        status: MessageBlockStatus.ERROR,
        error: toSerializedError(error)
      })
      await dbService.updateMessage(currentTopicId, assistantMessage.id, {
        status: AssistantMessageStatus.ERROR
      })
    } catch {
      // 忽略错误处理本身的失败
    }
    throw error
  } finally {
    if (controller && activeAbortController === controller) {
      activeAbortController = null
    }
  }
}

/** 根据 uniqId 从 store 中查找模型 */
export function findModelByUniqId(value: string): Model | null {
  for (const provider of store.getState().llm.providers) {
    const model = provider.models.find((m) => getModelUniqId(m) === value)
    if (model) {
      return model
    }
  }
  return null
}

/** 将任意错误转换为可存储的 SerializedError */
export function toSerializedError(error: unknown): SerializedError {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: getErrorMessage(error),
    stack: error instanceof Error ? (error.stack ?? null) : null
  }
}
