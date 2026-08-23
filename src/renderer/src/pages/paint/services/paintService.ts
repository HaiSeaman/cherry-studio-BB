import { loggerService } from '@logger'
import { PAINT_ENHANCE_PROMPT } from '@renderer/config/paint'
import { db } from '@renderer/databases'
import { fetchChatCompletion } from '@renderer/services/ApiService'
import { getDefaultAssistant, getTranslateModel } from '@renderer/services/AssistantService'
import { dbService } from '@renderer/services/db'
import FileManager from '@renderer/services/FileManager'
import { getModelUniqId } from '@renderer/services/ModelService'
import { NotificationService } from '@renderer/services/NotificationService'
import store from '@renderer/store'
import { addAssistant, addTopic, updateTopic, updateTopics, updateTopicUpdatedAt } from '@renderer/store/assistants'
import type { Assistant, Model, Topic } from '@renderer/types'
import type { FileMetadata } from '@renderer/types'
import { TopicType } from '@renderer/types'
import { getAssistantType } from '@renderer/types'
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
      // 非累积模式的模型 TEXT_DELTA 是增量片段，以完成回调的全文为准；
      // 完成回调文本为空串时保留已累积的增量（adapter 的 ?? 不会拦截空串）
      if (chunk.text) {
        optimizedText = chunk.text
      }
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

/**
 * 把游离的绘画话题（db.topics 中 type=paint 且不属于任何助手）挂到生图助手名下：
 * 聊天首页话题列表来自 Redux assistant.topics（持久化），故动作是 dispatch 话题元数据进去。
 * 无生图助手时先创建默认「灵感生图」助手；幂等：已被任何助手认领的话题不再重复挂载。
 */
export async function reassociatePaintTopics(): Promise<void> {
  const assistants: Assistant[] = store.getState().assistants.assistants
  const claimed = new Set(assistants.flatMap((a) => (a.topics ?? []).map((t) => t.id)))
  const orphanRows = (await db.topics.filter((t) => (t as { type?: string }).type === 'paint').toArray())
    .filter((t) => !claimed.has(t.id))
    .sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
  if (orphanRows.length === 0) return

  let target = assistants.find((a) => getAssistantType(a) === 'image_gen')
  if (!target) {
    target = { ...getDefaultAssistant(), id: uuid(), name: '灵感生图', emoji: '🎨', type: 'image_gen', topics: [] }
    store.dispatch(addAssistant(target))
  }
  const targetId = target.id
  const additions = orphanRows.map(
    (t) =>
      ({
        id: t.id,
        assistantId: targetId,
        name: t.name || '绘画会话',
        createdAt: t.updatedAt,
        updatedAt: t.updatedAt,
        messages: []
      }) as Topic
  )
  // dispatch 前重读最新 topics：上面的 await 期间用户可能已新增话题，用快照会覆盖丢失
  const latestTopics =
    store.getState().assistants.assistants.find((a) => a.id === targetId)?.topics ?? target.topics ?? []
  store.dispatch(updateTopics({ assistantId: targetId, topics: [...latestTopics, ...additions] }))
}

/** 创建新的绘画会话，返回话题对象并同步到数据库与助手 topics 列表 */
export async function createPaintTopic(assistantId?: string): Promise<Topic> {
  const id = uuid()
  const now = new Date().toISOString()
  const targetAssistantId = assistantId || 'paint'
  await db.topics.add({
    id,
    messages: [],
    type: TopicType.Paint,
    name: '新的绘画会话',
    updatedAt: now
  })
  const topic: Topic = {
    id,
    assistantId: targetAssistantId,
    name: '新的绘画会话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    isNameManuallyEdited: false
  }
  if (targetAssistantId && targetAssistantId !== 'paint') {
    store.dispatch(addTopic({ assistantId: targetAssistantId, topic }))
  }
  return topic
}

/** 获取当前设置的图片保存路径（空 = 使用默认目录 用户图片目录/CherryStudio） */
export function getImageSavePath(): string {
  return store.getState().settings.imageSavePath
}

/**
 * 将生成的图片自动保存到用户设置的目录
 * 保存失败不抛出（静默降级），历史记录仍保留在应用内部存储
 * @param images 展示用图片列表（data URL / file:// 本地 URL / 远程 URL）
 * @param files 已下载到内部存储的文件（优先从本地转存，避免二次下载远程 URL）
 */
export async function saveGeneratedImages(images: string[], files: FileMetadata[] = []): Promise<void> {
  const savePath = getImageSavePath()

  for (const file of files) {
    try {
      // base64Image 按物理文件名（uuid+ext）解析，需传 file.name 而非 file.id
      const { data } = await window.api.file.base64Image(file.name)
      await window.api.file.saveImageToDirectory(data, savePath)
    } catch (error) {
      logger.warn('自动保存图片失败（不影响历史记录）:', { fileId: file.id, error: error as Error })
    }
  }

  for (const image of images) {
    try {
      if (image.startsWith('data:')) {
        // base64 直存
        await window.api.file.saveImageToDirectory(image, savePath)
      } else if (image.startsWith('file://')) {
        // 内部存储文件，已通过 files 参数保存
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

/**
 * 将远程 URL 图片（百炼 OSS 等，有效期通常仅 24 小时）下载到应用内部存储持久化，
 * 返回本地展示 URL 与文件元数据；下载失败时回退原 URL（历史展示在过期后可能失效）。
 * 并行下载以缩短批量生成的等待时间
 */
async function persistRemoteImages(images: string[]): Promise<{ displayImages: string[]; files: FileMetadata[] }> {
  if (!images.some((image) => image.startsWith('http'))) {
    return { displayImages: images, files: [] }
  }
  const results = await Promise.all(
    images.map(async (image) => {
      if (!image.startsWith('http')) {
        return { localUrl: image, file: undefined as FileMetadata | undefined }
      }
      try {
        const file = await window.api.file.download(image, true)
        await FileManager.addFile(file)
        return { localUrl: FileManager.getFileUrl(file), file }
      } catch (error) {
        logger.warn('远程图片下载失败，保留原 URL（过期后历史图可能失效）:', {
          image: image.slice(0, 60),
          error: error as Error
        })
        return { localUrl: image, file: undefined as FileMetadata | undefined }
      }
    })
  )
  return {
    displayImages: results.map((result) => result.localUrl),
    files: results.filter((result) => result.file !== undefined).map((result) => result.file!)
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
  /** 消息归属的助手 id；缺省沿用历史遗留值 'paint'（老数据兼容） */
  assistantId?: string
  /** 中止信号（点击「停止生成」时触发） */
  signal?: AbortSignal
}

export type GeneratePaintImageResult = {
  topicId: string
  images: string[]
  /** 自动新建会话时挂到助手名下的话题（供调用方切换 activeTopic；已存在会话时为 undefined） */
  topic?: Topic
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
    assistantId,
    signal
  } = params

  // 本次生成的中止控制器（供「停止生成」按钮中止；调用方传入 signal 时优先使用调用方的）
  const controller = signal ? null : new AbortController()
  const effectiveSignal = signal ?? controller?.signal
  if (controller) {
    activeAbortController = controller
  }

  let targetTopicId = topicId ?? null
  let createdTopic: Topic | undefined
  const messageAssistantId = assistantId ?? 'paint'

  if (!targetTopicId) {
    createdTopic = await createPaintTopic(messageAssistantId)
    targetTopicId = createdTopic.id
  }
  const currentTopicId = targetTopicId

  // 用户提示词消息
  const userMessage = createMessage('user', currentTopicId, messageAssistantId)
  const userBlock = createMainTextBlock(userMessage.id, prompt)
  userMessage.blocks = [userBlock.id]

  // 助手图片消息（PENDING，生成完成后更新为 SUCCESS）
  const assistantMessage = createAssistantMessage(messageAssistantId, currentTopicId, { model, modelId: model.id })
  const imageBlock = createImageBlock(assistantMessage.id, { status: MessageBlockStatus.PENDING })
  assistantMessage.blocks = [imageBlock.id]

  await dbService.appendMessage(currentTopicId, userMessage, [userBlock])
  await dbService.appendMessage(currentTopicId, assistantMessage, [imageBlock])
  await db.topics.update(currentTopicId, { updatedAt: new Date().toISOString() })

  // 首次生成时用提示词命名会话（按 Unicode 码点切分，避免 emoji 代理对被截断产生乱码）
  const topicRow = await db.topics.get(currentTopicId)
  let renamedTo: string | undefined
  if (topicRow && (!topicRow.name || topicRow.name === '新的绘画会话')) {
    renamedTo = Array.from(prompt).slice(0, 20).join('')
    await db.topics.update(currentTopicId, {
      name: renamedTo,
      updatedAt: new Date().toISOString()
    })
  }

  // 同步 Redux 话题元数据（历史列表的名称/排序读 assistant.topics，只写 db 会陈旧）
  if (messageAssistantId !== 'paint') {
    const owner = store.getState().assistants.assistants.find((a) => a.id === messageAssistantId)
    const reduxTopic = owner?.topics?.find((t) => t.id === currentTopicId)
    if (reduxTopic) {
      if (renamedTo && reduxTopic.name !== renamedTo) {
        store.dispatch(
          updateTopic({
            assistantId: messageAssistantId,
            topic: { ...reduxTopic, name: renamedTo }
          })
        )
      } else {
        store.dispatch(updateTopicUpdatedAt({ topicId: currentTopicId }))
      }
    }
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
            // 远程 URL（百炼 OSS 等）有效期有限，先下载到内部存储持久化，
            // 历史记录与缩略图改用本地 URL，避免链接过期后裂图
            const { displayImages, files } = await persistRemoteImages(chunk.image.images)
            await db.message_blocks.update(imageBlock.id, {
              status: MessageBlockStatus.SUCCESS,
              ...(files.length > 0 ? { file: files[0] } : {}),
              metadata: {
                generateImageResponse: { ...chunk.image, images: displayImages },
                // 批量落盘的全部文件：删除会话时按此回收（file 字段只挂第一张）
                ...(files.length > 0 ? { generatedFiles: files } : {})
              }
            })
            await dbService.updateMessage(currentTopicId, assistantMessage.id, {
              status: AssistantMessageStatus.SUCCESS
            })
            // 自动保存到用户设置目录（失败静默，不影响历史记录）
            void saveGeneratedImages(displayImages, files)
            // 图片生成完成通知：仅当应用在后台（用户没盯着页面）时提醒，
            // 受设置 → 通知 → 灵感生图助手 开关控制
            if (!document.hasFocus()) {
              void NotificationService.getInstance().send({
                id: `paint_${Date.now()}`,
                type: 'success',
                title: '灵感生图助手',
                message: `图片生成完成${displayImages.length > 0 ? `，共 ${displayImages.length} 张` : ''}`,
                silent: false,
                timestamp: Date.now(),
                source: 'paint',
                channel: 'system'
              })
            }
          }
          // 注：错误统一在 catch 分支落 ERROR 块，此处不再处理 ERROR chunk
        } catch {
          // 会话已被删除等场景，忽略块更新失败
        }
      }
    })

    return { topicId: currentTopicId, images, ...(createdTopic ? { topic: createdTopic } : {}) }
  } catch (error) {
    if (isAbortError(error)) {
      // 用户主动中止 ≠ 失败：落 PAUSED 状态（不渲染红色错误卡），由调用方提示"已停止生成"
      try {
        await db.message_blocks.update(imageBlock.id, { status: MessageBlockStatus.PAUSED })
        await dbService.updateMessage(currentTopicId, assistantMessage.id, {
          status: AssistantMessageStatus.PAUSED
        })
      } catch {
        // 忽略错误处理本身的失败
      }
      throw error
    }
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
