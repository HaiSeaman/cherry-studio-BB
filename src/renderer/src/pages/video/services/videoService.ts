import { loggerService } from '@logger'
import { db } from '@renderer/databases'
import { dbService } from '@renderer/services/db'
import FileManager from '@renderer/services/FileManager'
import { NotificationService } from '@renderer/services/NotificationService'
import store from '@renderer/store'
import { addTopic, updateTopic, updateTopicUpdatedAt } from '@renderer/store/assistants'
import type { FileMetadata, Topic } from '@renderer/types'
import { TopicType } from '@renderer/types'
import { AssistantMessageStatus, MessageBlockStatus } from '@renderer/types/newMessage'
import { uuid } from '@renderer/utils'
import { isAbortError, toSerializedError } from '@renderer/utils/error'
import {
  createAssistantMessage,
  createMainTextBlock,
  createMessage,
  createVideoBlock
} from '@renderer/utils/messageUtils/create'

import { fetchVideoGeneration } from './fetchVideoGeneration'

const logger = loggerService.withContext('VideoService')

// 当前生成任务的中止控制器（模块级：与生图 paintService 同模式）
let activeAbortController: AbortController | null = null

/** 中止当前正在进行的视频生成（点击「停止生成」时调用） */
export function abortCurrentVideoGeneration(): void {
  activeAbortController?.abort()
}

/** 创建新的视频会话，返回话题对象并同步到数据库与助手 topics 列表 */
export async function createVideoTopic(assistantId?: string): Promise<Topic> {
  const id = uuid()
  const now = new Date().toISOString()
  const targetAssistantId = assistantId || 'video'
  await db.topics.add({
    id,
    messages: [],
    type: TopicType.Video,
    name: '新的视频会话',
    updatedAt: now
  })
  const topic: Topic = {
    id,
    assistantId: targetAssistantId,
    name: '新的视频会话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    isNameManuallyEdited: false
  }
  if (targetAssistantId && targetAssistantId !== 'video') {
    store.dispatch(addTopic({ assistantId: targetAssistantId, topic }))
  }
  return topic
}

/**
 * 将远程 URL 视频（三家返回的链接有效期约 24 小时）下载到应用内部存储持久化，
 * 返回本地展示 URL 与文件元数据；下载失败时回退原 URL 并记日志。
 */
async function persistRemoteVideo(videoUrl: string): Promise<{ displayUrl: string; file?: FileMetadata }> {
  if (!videoUrl.startsWith('http')) {
    return { displayUrl: videoUrl }
  }
  try {
    const file = await window.api.file.download(videoUrl, true)
    await FileManager.addFile(file)
    return { displayUrl: FileManager.getFileUrl(file), file }
  } catch (error) {
    logger.warn('远程视频下载失败，保留原 URL（过期后历史视频可能失效）:', {
      videoUrl: videoUrl.slice(0, 60),
      error: error as Error
    })
    return { displayUrl: videoUrl }
  }
}

/**
 * 自动保存生成的视频到用户设置的目录（复用图片保存路径设置）。
 * 内部存储文件 → base64 → 静默写入目标目录（不弹对话框）；结果以 toast 告知用户。
 */
export async function saveGeneratedVideo(file: FileMetadata | undefined): Promise<void> {
  if (!file) {
    return
  }
  const savePath = store.getState().settings.imageSavePath
  if (!savePath) {
    return
  }
  try {
    const { data: base64 } = await window.api.file.base64File(file.id)
    await window.api.file.saveFileToDirectory(file.name, base64, savePath)
    window.toast.success(`视频已自动保存到: ${savePath}`)
  } catch (error) {
    logger.warn('自动保存视频失败:', { fileId: file.id, error: error as Error })
    window.toast.error('视频自动保存失败，可在历史记录中手动另存')
  }
}

/** 视频生成参数（文生视频 / 图生视频共用） */
export type GenerateVideoParams = {
  modelId: string
  providerId: string
  prompt: string
  /** 图生视频首帧参考图（base64 data URL 或 http(s) URL） */
  inputImage?: string
  duration?: string
  resolution?: string
  aspectRatio?: string
  /** 目标会话 id；为空时自动创建新会话 */
  topicId?: string | null
  /** 消息归属的助手 id；缺省沿用历史遗留值 'video'（老数据兼容） */
  assistantId?: string
  /** 中止信号 */
  signal?: AbortSignal
}

export type GenerateVideoResult = {
  topicId: string
  /** 自动新建会话时挂到助手名下的话题（供调用方切换 activeTopic；已存在会话时为 undefined） */
  topic?: Topic
}

/** 进度文案：排队中/生成中 + 已用时（三家接口均无百分比，不做假进度条） */
export function buildProgressText(state: 'queued' | 'running', elapsedMs: number): string {
  return state === 'queued' ? '⏳ 排队中…' : `🎬 生成中 ${Math.round(elapsedMs / 1000)}s`
}

/**
 * 统一视频生成流程：
 * 1. 确定会话（无则创建）
 * 2. 写入用户提示词消息 + 助手 PENDING 视频消息
 * 3. fetchVideoGeneration 提交任务并轮询（onStatus 更新块 metadata.progressText）
 * 4. 成功：下载持久化 → VIDEO 块 SUCCESS → 自动保存 → 失焦通知
 * 失败落 ERROR、用户中止落 PAUSED（不渲染红色错误卡）
 */
export async function generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
  const {
    modelId,
    providerId,
    prompt,
    inputImage,
    duration,
    resolution,
    aspectRatio,
    topicId,
    assistantId,
    signal
  } = params

  // 从 provider store 取完整配置；找不到说明服务商已被删除，显式报错避免用错地址/密钥
  const provider = store.getState().llm.providers.find((p) => p.id === providerId)
  if (!provider) {
    throw new Error('该模型所属的服务商已不存在，请重新选择模型')
  }

  // 本次生成的中止控制器（供「停止生成」按钮中止；调用方传入 signal 时优先使用调用方的）
  const controller = signal ? null : new AbortController()
  const effectiveSignal = signal ?? controller?.signal
  if (controller) {
    activeAbortController = controller
  }

  let targetTopicId = topicId ?? null
  let createdTopic: Topic | undefined
  const messageAssistantId = assistantId || 'video'

  if (!targetTopicId) {
    createdTopic = await createVideoTopic(messageAssistantId)
    targetTopicId = createdTopic.id
  }
  const currentTopicId = targetTopicId

  // 用户提示词消息
  const userMessage = createMessage('user', currentTopicId, messageAssistantId)
  const userBlock = createMainTextBlock(userMessage.id, prompt)
  userMessage.blocks = [userBlock.id]

  // 助手视频消息（PENDING，完成后更新为 SUCCESS）
  const assistantMessage = createAssistantMessage(messageAssistantId, currentTopicId, { modelId })
  const videoBlock = createVideoBlock(assistantMessage.id, { status: MessageBlockStatus.PENDING })
  assistantMessage.blocks = [videoBlock.id]

  await dbService.appendMessage(currentTopicId, userMessage, [userBlock])
  await dbService.appendMessage(currentTopicId, assistantMessage, [videoBlock])
  await db.topics.update(currentTopicId, { updatedAt: new Date().toISOString() })

  // 首次生成时用提示词命名会话（按 Unicode 码点切分，避免 emoji 截断乱码）
  const topicRow = await db.topics.get(currentTopicId)
  let renamedTo: string | undefined
  if (topicRow && (!topicRow.name || topicRow.name === '新的视频会话')) {
    renamedTo = Array.from(prompt).slice(0, 20).join('')
    await db.topics.update(currentTopicId, { name: renamedTo, updatedAt: new Date().toISOString() })
  }

  // 同步 Redux 话题元数据（历史列表读 assistant.topics，只写 db 会陈旧）
  syncTopicMeta(messageAssistantId, currentTopicId, renamedTo)

  try {
    const videoUrl = await fetchVideoGeneration({
      provider,
      model: modelId,
      prompt,
      ...(inputImage ? { inputImage } : {}),
      ...(duration ? { duration } : {}),
      ...(resolution ? { resolution } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(effectiveSignal ? { signal: effectiveSignal } : {}),
      onStatus: (status) => {
        // 进度文案写进块 metadata；生成期间用户可能删除会话导致块不存在，静默忽略
        void db.message_blocks
          .update(videoBlock.id, {
            metadata: { progressText: buildProgressText(status.state, status.elapsedMs) }
          })
          .catch(() => {})
      }
    })

    // 远程 URL 有效期短，立即下载持久化；本地/远程地址统一放 metadata
    // （Dexie message_blocks 表按基类 UpdateSpec 校验，直接更新 url/filePath 字段过不了类型检查）
    const { displayUrl, file } = await persistRemoteVideo(videoUrl)
    await db.message_blocks.update(videoBlock.id, {
      status: MessageBlockStatus.SUCCESS,
      metadata: {
        remoteUrl: videoUrl,
        localUrl: displayUrl,
        fileId: file?.id,
        fileName: file?.name,
        filePath: file?.path
      }
    })
    await dbService.updateMessage(currentTopicId, assistantMessage.id, { status: AssistantMessageStatus.SUCCESS })

    // 自动保存到用户设置目录（失败静默，不影响历史记录）
    void saveGeneratedVideo(file)

    // 仅当应用在后台（用户没盯着页面）时提醒
    if (!document.hasFocus()) {
      void NotificationService.getInstance().send({
        id: `video_${Date.now()}`,
        type: 'success',
        title: '动感视频助手',
        message: '视频生成完成',
        silent: false,
        timestamp: Date.now(),
        source: 'video',
        channel: 'system'
      })
    }

    return { topicId: currentTopicId, ...(createdTopic ? { topic: createdTopic } : {}) }
  } catch (error) {
    if (isAbortError(error)) {
      // 用户主动中止 ≠ 失败：落 PAUSED 状态（不渲染红色错误卡），由调用方提示"已停止生成"
      try {
        await db.message_blocks.update(videoBlock.id, { status: MessageBlockStatus.PAUSED })
        await dbService.updateMessage(currentTopicId, assistantMessage.id, { status: AssistantMessageStatus.PAUSED })
      } catch {
        // 忽略错误处理本身的失败
      }
      throw error
    }
    logger.error('视频生成失败:', error as Error)
    try {
      await db.message_blocks.update(videoBlock.id, {
        status: MessageBlockStatus.ERROR,
        error: toSerializedError(error)
      })
      await dbService.updateMessage(currentTopicId, assistantMessage.id, { status: AssistantMessageStatus.ERROR })
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

/** 同步 Redux 话题元数据（重命名/排序时间戳）；遗留归属 id 或话题不在 Redux 中时静默跳过 */
function syncTopicMeta(assistantId: string, topicId: string, newName?: string): void {
  if (assistantId === 'video') {
    return
  }
  const owner = store.getState().assistants.assistants.find((a) => a.id === assistantId)
  const reduxTopic = owner?.topics?.find((t) => t.id === topicId)
  if (!reduxTopic) {
    return
  }
  if (newName && reduxTopic.name !== newName) {
    store.dispatch(updateTopic({ assistantId, topic: { ...reduxTopic, name: newName } }))
  } else {
    store.dispatch(updateTopicUpdatedAt({ topicId }))
  }
}

