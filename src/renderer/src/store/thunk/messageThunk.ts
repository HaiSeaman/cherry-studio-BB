import { loggerService } from '@logger'
import db from '@renderer/databases'
import { transformMessagesAndFetch } from '@renderer/services/ApiService'
import { dbService } from '@renderer/services/db'
import FileManager from '@renderer/services/FileManager'
import { BlockManager } from '@renderer/services/messageStreaming/BlockManager'
import { createCallbacks } from '@renderer/services/messageStreaming/callbacks'
import { createStreamProcessor, type StreamProcessorCallbacks } from '@renderer/services/StreamProcessingService'
import store from '@renderer/store'
import { updateTopicUpdatedAt } from '@renderer/store/assistants'
import { type Assistant, type FileMetadata, type Model, type Topic } from '@renderer/types'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'
import type { FileMessageBlock, ImageMessageBlock, Message, MessageBlock } from '@renderer/types/newMessage'
import { AssistantMessageStatus, MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { uuid } from '@renderer/utils'
import { abortCompletion, addAbortController, removeAbortController } from '@renderer/utils/abortController'
import {
  createAssistantMessage,
  createTranslationBlock,
  resetAssistantMessage
} from '@renderer/utils/messageUtils/create'
import { getTopicQueue, waitForTopicQueue } from '@renderer/utils/queue'
import { defaultAppHeaders } from '@shared/utils'
import { throttle } from 'lodash'
import { LRUCache } from 'lru-cache'

import type { AppDispatch, RootState } from '../index'
import { removeManyBlocks, updateOneBlock, upsertManyBlocks, upsertOneBlock } from '../messageBlock'
import { newMessagesActions, selectMessagesForTopic } from '../newMessage'

const logger = loggerService.withContext('MessageThunk')

/**
 * 首 token 看门狗时长：预流阶段（MCP 工具拉取/IPC/文件读取/建连）没有超时覆盖，
 * 一旦挂起会让队列任务永不结束 → loading 永久卡死 → 发送按钮永久禁用（只能重启应用）。
 * 90 秒内未产出任何流式块即中止请求，走正常错误路径复位状态。
 */
const FIRST_TOKEN_TIMEOUT_MS = 90_000

/**
 * Merge two message lists by id (incoming wins). Used before writing a topic's
 * messages array to the DB so that messages present in the DB but absent from
 * the local Redux snapshot (another window wrote them, or the topic was not
 * fully loaded) are never dropped by an overwrite.
 */
function mergeMessagesById(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>()
  for (const m of existing) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return Array.from(byId.values())
}

/**
 * Transactionally merge `incoming` messages into a topic's persisted message
 * list instead of blindly overwriting it.
 */
async function updateTopicMessagesMerged(topicId: string, incoming: Message[]): Promise<void> {
  await db.transaction('rw', db.topics, async () => {
    const topic = await db.topics.get(topicId)
    if (!topic) return
    await db.topics.update(topicId, { messages: mergeMessagesById(topic.messages ?? [], incoming) })
  })
}

const finishTopicLoading = async (topicId: string) => {
  await waitForTopicQueue(topicId)
  store.dispatch(newMessagesActions.setTopicLoading({ topicId, loading: false }))
  store.dispatch(newMessagesActions.setTopicFulfilled({ topicId, fulfilled: true }))
}

// TODO: 后续可以将db操作移到Listener Middleware中
// export const saveMessageAndBlocksToDB = async (message: Message, blocks: MessageBlock[], messageIndex: number = -1) => {
//   return saveMessageAndBlocksToDBV2(message.topicId, message, blocks, messageIndex)
// }

const updateExistingMessageAndBlocksInDB = async (
  updatedMessage: Partial<Message> & Pick<Message, 'id' | 'topicId'>,
  updatedBlocks: MessageBlock[]
) => {
  try {
    // Always update blocks if provided
    if (updatedBlocks.length > 0) {
      await updateBlocks(updatedBlocks)
    }

    // Check if there are message properties to update beyond id and topicId
    const messageKeysToUpdate = Object.keys(updatedMessage).filter((key) => key !== 'id' && key !== 'topicId')

    if (messageKeysToUpdate.length > 0) {
      const messageUpdatesPayload = messageKeysToUpdate.reduce<Partial<Message>>((acc, key) => {
        acc[key] = updatedMessage[key]
        return acc
      }, {})

      await updateMessage(updatedMessage.topicId, updatedMessage.id, messageUpdatesPayload)

      store.dispatch(updateTopicUpdatedAt({ topicId: updatedMessage.topicId }))
    }
  } catch (error) {
    logger.error(`[updateExistingMsg] Failed to update message ${updatedMessage.id}:`, error as Error)
  }
}

/**
 * 消息块节流器。
 * 每个消息块有独立节流器，并发更新时不会互相影响
 */
const blockUpdateThrottlers = new LRUCache<string, ReturnType<typeof throttle>>({
  max: 100,
  ttl: 1000 * 60 * 5,
  updateAgeOnGet: true,
  dispose: (throttler, id) => {
    throttler.cancel()
    const rafId = blockUpdateRafs.get(id)
    if (rafId) {
      cancelAnimationFrame(rafId)
      blockUpdateRafs.delete(id)
    }
  }
})

/**
 * 消息块 RAF 缓存。
 * 用于管理 RAF 请求创建和取消。
 */
const blockUpdateRafs = new LRUCache<string, number>({
  max: 100,
  ttl: 1000 * 60 * 5,
  updateAgeOnGet: true,
  dispose: (rafId) => {
    cancelAnimationFrame(rafId)
  }
})

/**
 * 获取或创建消息块专用的节流函数。
 */
const getBlockThrottler = (id: string) => {
  if (!blockUpdateThrottlers.has(id)) {
    const throttler = throttle(async (blockUpdate: any) => {
      const existingRAF = blockUpdateRafs.get(id)
      if (existingRAF) {
        cancelAnimationFrame(existingRAF)
      }

      const rafId = requestAnimationFrame(() => {
        store.dispatch(updateOneBlock({ id, changes: blockUpdate }))
        blockUpdateRafs.delete(id)
      })

      blockUpdateRafs.set(id, rafId)
      await updateSingleBlock(id, blockUpdate)
    }, 150)

    blockUpdateThrottlers.set(id, throttler)
  }

  return blockUpdateThrottlers.get(id)!
}

/**
 * 更新单个消息块。
 */
export const throttledBlockUpdate = (id: string, blockUpdate: any) => {
  const throttler = getBlockThrottler(id)
  // store.dispatch(updateOneBlock({ id, changes: blockUpdate }))
  throttler(blockUpdate)
}

/**
 * 取消单个块的节流更新，移除节流器和 RAF。
 */
export const cancelThrottledBlockUpdate = (id: string) => {
  const rafId = blockUpdateRafs.get(id)
  if (rafId) {
    cancelAnimationFrame(rafId)
    blockUpdateRafs.delete(id)
  }

  const throttler = blockUpdateThrottlers.get(id)
  if (throttler) {
    throttler.cancel()
    blockUpdateThrottlers.delete(id)
  }
}

/**
 * 批量清理多个消息块。
 *
 * NOTE: This only removes the blocks from Redux and cancels pending throttled
 * updates. Physical file cleanup (decrementing FileManager reference counts)
 * is handled exactly once by the DB delete path (DexieMessageDataSource
 * deleteMessage/deleteMessages/clearMessages); doing it here as well would
 * double-decrement the count and destroy files still referenced elsewhere.
 */
export const cleanupMultipleBlocks = (dispatch: AppDispatch, blockIds: string[]) => {
  blockIds.forEach((id) => {
    cancelThrottledBlockUpdate(id)
  })

  if (blockIds.length > 0) {
    dispatch(removeManyBlocks(blockIds))
  }
}

/**
 * Decrement file reference counts for blocks that are deleted MANUALLY
 * (resend / regenerate / removeBlocks), i.e. paths that do NOT go through the
 * DexieMessageDataSource delete functions (which already do this). Must run
 * OUTSIDE a Dexie transaction (FileManager.deleteFile opens its own).
 */
const cleanupBlocksFiles = async (blockIds: string[]) => {
  if (blockIds.length === 0) return
  try {
    const blocks = await db.message_blocks.where('id').anyOf(blockIds).toArray()
    const files = blocks
      .filter((block) => block.type === MessageBlockType.FILE || block.type === MessageBlockType.IMAGE)
      .map((block) => block.file)
      .filter((file): file is FileMetadata => file !== undefined)
    await Promise.all(files.map((file) => FileManager.deleteFile(file.id, false)))
  } catch (error) {
    logger.error('[cleanupBlocksFiles] Failed to decrement file counts:', error as Error)
  }
}

// 新增: 通用的、非节流的函数，用于保存消息和块的更新到数据库
const saveUpdatesToDB = async (
  messageId: string,
  topicId: string,
  messageUpdates: Partial<Message>, // 需要更新的消息字段
  blocksToUpdate: MessageBlock[] // 需要更新/创建的块
) => {
  try {
    const messageDataToSave: Partial<Message> & Pick<Message, 'id' | 'topicId'> = {
      id: messageId,
      topicId,
      ...messageUpdates
    }
    await updateExistingMessageAndBlocksInDB(messageDataToSave, blocksToUpdate)
  } catch (error) {
    logger.error(`[DB Save Updates] Failed for message ${messageId}:`, error as Error)
  }
}

// 新增: 辅助函数，用于获取并保存单个更新后的 Block 到数据库
const saveUpdatedBlockToDB = async (
  blockId: string | null,
  messageId: string,
  topicId: string,
  getState: () => RootState
) => {
  if (!blockId) {
    logger.warn('[DB Save Single Block] Received null/undefined blockId. Skipping save.')
    return
  }
  const state = getState()
  const blockToSave = state.messageBlocks.entities[blockId]
  if (blockToSave) {
    await saveUpdatesToDB(messageId, topicId, {}, [blockToSave]) // Pass messageId, topicId, empty message updates, and the block
  } else {
    logger.warn(`[DB Save Single Block] Block ${blockId} not found in state. Cannot save.`)
  }
}

// Removed persistAgentExchange and createPersistedMessagePayload functions
// These are no longer needed since messages are saved immediately via appendMessage
// and updated during streaming via updateMessageAndBlocks

// --- Helper Function for Multi-Model Dispatch ---
// 多模型创建和发送请求的逻辑，用于用户消息多模型发送和重发
const dispatchMultiModelResponses = async (
  dispatch: AppDispatch,
  getState: () => RootState,
  topicId: string,
  triggeringMessage: Message, // userMessage or messageToResend
  assistant: Assistant,
  mentionedModels: Model[]
) => {
  const assistantMessageStubs: Message[] = []
  const tasksToQueue: { assistantConfig: Assistant; messageStub: Message }[] = []

  for (const mentionedModel of mentionedModels) {
    const assistantForThisMention = { ...assistant, model: mentionedModel }
    const assistantMessage = createAssistantMessage(assistant.id, topicId, {
      askId: triggeringMessage.id,
      model: mentionedModel,
      modelId: mentionedModel.id,
      traceId: triggeringMessage.traceId
    })
    dispatch(newMessagesActions.addMessage({ topicId, message: assistantMessage }))
    assistantMessageStubs.push(assistantMessage)
    tasksToQueue.push({
      assistantConfig: assistantForThisMention,
      messageStub: assistantMessage
    })
  }

  const topicFromDB = await db.topics.get(topicId)
  if (topicFromDB) {
    const currentTopicMessageIds = getState().messages.messageIdsByTopic[topicId] || []
    const currentEntities = getState().messages.entities
    const messagesToSaveInDB = currentTopicMessageIds.map((id) => currentEntities[id]).filter((m): m is Message => !!m)
    // Merge with the persisted list so a topic that was not fully loaded (or
    // was written by another window) is not wiped by a stale snapshot.
    await updateTopicMessagesMerged(topicId, messagesToSaveInDB)
  } else {
    logger.error(`[dispatchMultiModelResponses] Topic ${topicId} not found in DB during multi-model save.`)
    throw new Error(`Topic ${topicId} not found in DB.`)
  }

  const queue = getTopicQueue(topicId)
  for (const task of tasksToQueue) {
    void queue.add(async () => {
      await fetchAndProcessAssistantResponseImpl(dispatch, getState, topicId, task.assistantConfig, task.messageStub)
    })
  }
}

// --- End Helper Function ---
// 发送和处理助手响应的实现函数，话题提示词在此拼接
const fetchAndProcessAssistantResponseImpl = async (
  dispatch: AppDispatch,
  getState: () => RootState,
  topicId: string,
  origAssistant: Assistant,
  assistantMessage: Message // Pass the prepared assistant message (new or reset)
) => {
  const topic = origAssistant.topics.find((t) => t.id === topicId)
  const assistant = topic?.prompt
    ? { ...origAssistant, prompt: `${origAssistant.prompt}\n${topic.prompt}` }
    : origAssistant
  const assistantMsgId = assistantMessage.id
  // Hoisted so the cleanup finally block (which runs for success AND failure)
  // can release the abort registration.
  const userMessageId = assistantMessage.askId
  let callbacks: StreamProcessorCallbacks = {}
  // Hoisted：finally 中按函数精确移除 abort 注册（多模型流共用 askId 时不能 delete 整条目）
  let abortFn: (() => void) | null = null
  // Hoisted：首 token 看门狗定时器，finally 中兜底清理
  let firstTokenWatchdog: ReturnType<typeof setTimeout> | null = null
  try {
    dispatch(newMessagesActions.setTopicLoading({ topicId, loading: true }))

    // 创建 BlockManager 实例
    const blockManager = new BlockManager({
      dispatch,
      getState,
      saveUpdatedBlockToDB,
      saveUpdatesToDB,
      assistantMsgId,
      topicId,
      throttledBlockUpdate,
      cancelThrottledBlockUpdate
    })

    const allMessagesForTopic = selectMessagesForTopic(getState(), topicId)

    let messagesForContext: Message[] = []
    const userMessageIndex = allMessagesForTopic.findIndex((m) => m?.id === userMessageId)

    if (userMessageIndex === -1) {
      logger.error(
        `[fetchAndProcessAssistantResponseImpl] Triggering user message ${userMessageId} (askId of ${assistantMsgId}) not found. Falling back.`
      )
      const assistantMessageIndexFallback = allMessagesForTopic.findIndex((m) => m?.id === assistantMsgId)
      messagesForContext = (
        assistantMessageIndexFallback !== -1
          ? allMessagesForTopic.slice(0, assistantMessageIndexFallback)
          : allMessagesForTopic
      ).filter((m) => m && !m.status?.includes('ing'))
    } else {
      const contextSlice = allMessagesForTopic.slice(0, userMessageIndex + 1)
      messagesForContext = contextSlice.filter((m) => m && !m.status?.includes('ing'))
    }

    // Ensure at least the triggering user message is present to avoid empty payloads
    if ((!messagesForContext || messagesForContext.length === 0) && userMessageId) {
      const stateAfter = getState()
      const maybeUserMessage = stateAfter.messages.entities[userMessageId]
      if (maybeUserMessage) {
        messagesForContext = [maybeUserMessage]
      }
    }

    callbacks = createCallbacks({
      blockManager,
      dispatch,
      getState,
      topicId,
      assistantMsgId,
      saveUpdatesToDB,
      assistant
    })
    const streamProcessorCallbacks = createStreamProcessor(callbacks)

    const abortController = new AbortController()
    logger.silly('Add Abort Controller', { id: userMessageId })
    abortFn = () => abortController.abort()
    addAbortController(userMessageId!, abortFn)

    // 首 token 看门狗：预流阶段（MCP 工具拉取/IPC/文件读取/建连）无超时覆盖，
    // 一旦挂起队列任务永不结束 → loading 永久卡死。首个真实流式块到达即解除。
    let firstChunkReceived = false
    firstTokenWatchdog = setTimeout(() => {
      if (!firstChunkReceived) {
        logger.warn('First token watchdog fired: aborting request with no stream output', { topicId, userMessageId })
        abortController.abort(new DOMException('模型在 90 秒内未开始响应，已自动停止', 'TimeoutError'))
      }
    }, FIRST_TOKEN_TIMEOUT_MS)
    // 包装 chunk 入口：LLM_RESPONSE_CREATED 是本地同步发出的占位信号，不算流式产出
    const guardedChunkProcessor: (chunk: Chunk) => void = (chunk) => {
      if (!firstChunkReceived && chunk.type !== ChunkType.LLM_RESPONSE_CREATED) {
        firstChunkReceived = true
        if (firstTokenWatchdog != null) clearTimeout(firstTokenWatchdog)
      }
      streamProcessorCallbacks(chunk)
    }

    await transformMessagesAndFetch(
      {
        messages: messagesForContext,
        assistant,
        topicId,
        blockManager,
        assistantMsgId,
        callbacks,
        options: {
          signal: abortController.signal,
          headers: defaultAppHeaders()
        }
      },
      guardedChunkProcessor
    )
  } catch (error: any) {
    logger.error('Error in fetchAndProcessAssistantResponseImpl:', error)
    // 统一错误处理：确保 loading 状态被正确设置，避免队列任务卡住
    try {
      callbacks.onError?.(error)
    } catch (callbackError) {
      logger.error('Error in onError callback:', callbackError as Error)
    } finally {
      // 确保无论如何都设置 loading 为 false（onError 回调中已设置，这里是保险）
      dispatch(newMessagesActions.setTopicLoading({ topicId, loading: false }))
    }
  } finally {
    // 只移除本次注册的 abort 函数：多模型 @提及 时多个流共用同一 askId，
    // delete 整个条目会把其他仍在流式中的流的停止能力一起删掉
    if (firstTokenWatchdog != null) clearTimeout(firstTokenWatchdog)
    if (userMessageId && abortFn) {
      removeAbortController(userMessageId, abortFn)
    }
  }
}

/**
 * 发送消息并处理助手回复
 * @param userMessage 已创建的用户消息
 * @param userMessageBlocks 用户消息关联的消息块
 * @param assistant 助手对象
 * @param topicId 主题ID
 */
export const sendMessage =
  (userMessage: Message, userMessageBlocks: MessageBlock[], assistant: Assistant, topicId: Topic['id']) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      if (userMessage.blocks.length === 0) {
        logger.warn('sendMessage: No blocks in the provided message.')
        return
      }

      await saveMessageAndBlocksToDB(topicId, userMessage, userMessageBlocks)
      dispatch(newMessagesActions.addMessage({ topicId, message: userMessage }))
      if (userMessageBlocks.length > 0) {
        dispatch(upsertManyBlocks(userMessageBlocks))
      }
      dispatch(updateTopicUpdatedAt({ topicId }))

      const queue = getTopicQueue(topicId)

      const mentionedModels = userMessage.mentions

      if (mentionedModels && mentionedModels.length > 0) {
        await dispatchMultiModelResponses(dispatch, getState, topicId, userMessage, assistant, mentionedModels)
      } else {
        const assistantMessage = createAssistantMessage(assistant.id, topicId, {
          askId: userMessage.id,
          model: assistant.model,
          traceId: userMessage.traceId
        })
        await saveMessageAndBlocksToDB(topicId, assistantMessage, [])
        dispatch(
          newMessagesActions.addMessage({
            topicId,
            message: assistantMessage
          })
        )

        void queue.add(async () => {
          await fetchAndProcessAssistantResponseImpl(dispatch, getState, topicId, assistant, assistantMessage)
        })
      }
    } catch (error) {
      logger.error('Error in sendMessage thunk:', error as Error)
    } finally {
      void finishTopicLoading(topicId)
    }
  }

/**
 * Loads messages and their blocks for a specific topic from the database
 * and updates the Redux store.
 */
// export const loadTopicMessagesThunk =
//   (topicId: string, forceReload: boolean = false) =>
//   async (dispatch: AppDispatch, getState: () => RootState) => {
//     return loadTopicMessagesThunkV2(topicId, forceReload)(dispatch, getState)
//   }

/**
 * Thunk to delete a single message and its associated blocks.
 */
export const deleteSingleMessageThunk =
  (topicId: string, messageId: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    const currentState = getState()
    const messageToDelete = currentState.messages.entities[messageId]
    if (!messageToDelete || messageToDelete.topicId !== topicId) {
      logger.error(`[deleteSingleMessage] Message ${messageId} not found in topic ${topicId}.`)
      return
    }

    const blockIdsToDelete = messageToDelete.blocks || []

    try {
      dispatch(newMessagesActions.removeMessage({ topicId, messageId }))
      cleanupMultipleBlocks(dispatch, blockIdsToDelete)
      await deleteMessageFromDB(topicId, messageId)
    } catch (error) {
      logger.error(`[deleteSingleMessage] Failed to delete message ${messageId}:`, error as Error)
    }
  }

/**
 * Thunk to delete a group of messages (user query + assistant responses) based on askId.
 */
export const deleteMessageGroupThunk =
  (topicId: string, askId: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    const currentState = getState()
    const topicMessageIds = currentState.messages.messageIdsByTopic[topicId] || []
    const messagesToDelete: Message[] = []

    topicMessageIds.forEach((id) => {
      const msg = currentState.messages.entities[id]
      if (msg && msg.askId === askId) {
        messagesToDelete.push(msg)
      }
    })

    // const userQuery = currentState.messages.entities[askId]
    // if (userQuery && userQuery.topicId === topicId && !idsToDelete.includes(askId)) {
    //   messagesToDelete.push(userQuery)
    //   idsToDelete.push(askId)
    // }

    if (messagesToDelete.length === 0) {
      logger.warn(`[deleteMessageGroup] No messages found with askId ${askId} in topic ${topicId}.`)
      return
    }

    const blockIdsToDelete = messagesToDelete.flatMap((m) => m.blocks || [])
    const messageIdsToDelete = messagesToDelete.map((m) => m.id)

    try {
      dispatch(newMessagesActions.removeMessagesByAskId({ topicId, askId }))
      cleanupMultipleBlocks(dispatch, blockIdsToDelete)
      await deleteMessagesFromDB(topicId, messageIdsToDelete)
    } catch (error) {
      logger.error(`[deleteMessageGroup] Failed to delete messages with askId ${askId}:`, error as Error)
    }
  }

/**
 * Thunk to clear all messages and associated blocks for a topic.
 */
export const clearTopicMessagesThunk =
  (topicId: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      const state = getState()
      // 先中止该话题所有在途流：abort 注册按 askId 存，否则清空后流会立即重建消息
      const askIds = [
        ...new Set((selectMessagesForTopic(state, topicId) ?? []).map((m) => m.askId).filter(Boolean) as string[])
      ]
      for (const askId of askIds) {
        abortCompletion(askId)
      }

      const messageIdsToClear = state.messages.messageIdsByTopic[topicId] || []
      const blockIdsToDeleteSet = new Set<string>()

      messageIdsToClear.forEach((messageId) => {
        const message = state.messages.entities[messageId]
        message?.blocks?.forEach((blockId) => blockIdsToDeleteSet.add(blockId))
      })

      const blockIdsToDelete = Array.from(blockIdsToDeleteSet)

      dispatch(newMessagesActions.clearTopicMessages(topicId))
      cleanupMultipleBlocks(dispatch, blockIdsToDelete)
      await clearMessagesFromDB(topicId)
    } catch (error) {
      logger.error(`[clearTopicMessagesThunk] Failed to clear messages for topic ${topicId}:`, error as Error)
    }
  }

/**
 * Thunk to resend a user message by regenerating its associated assistant responses.
 * Finds all assistant messages responding to the given user message, resets them,
 * and queues them for regeneration without deleting other messages.
 */
export const resendMessageThunk =
  (topicId: Topic['id'], userMessageToResend: Message, assistant: Assistant) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      const state = getState()
      // Use selector to get all messages for the topic
      const allMessagesForTopic = selectMessagesForTopic(state, topicId)

      // Filter to find the assistant messages to reset
      const assistantMessagesToReset = allMessagesForTopic.filter(
        (m) => m.askId === userMessageToResend.id && m.role === 'assistant'
      )

      // Clear cached search results for the user message being resent
      // This ensures that the regenerated responses will not use stale search results
      try {
        window.keyv.remove(`web-search-${userMessageToResend.id}`)
        window.keyv.remove(`knowledge-search-${userMessageToResend.id}`)
      } catch (error) {
        logger.warn(`Failed to clear keyv cache for message ${userMessageToResend.id}:`, error as Error)
      }

      const resetDataList: Message[] = []

      if (assistantMessagesToReset.length === 0 && !userMessageToResend?.mentions?.length) {
        // 没有相关的助手消息且没有提及模型时，使用助手模型创建一条消息

        const assistantMessage = createAssistantMessage(assistant.id, topicId, {
          askId: userMessageToResend.id,
          model: assistant.model
        })
        assistantMessage.traceId = userMessageToResend.traceId
        resetDataList.push(assistantMessage)

        resetDataList.forEach((message) => {
          dispatch(newMessagesActions.addMessage({ topicId, message }))
        })
      }

      // 处理存在相关的助手消息的情况
      const allBlockIdsToDelete: string[] = []
      const messagesToUpdateInRedux: {
        topicId: string
        messageId: string
        updates: Partial<Message>
      }[] = []

      // 先处理已有的重传
      for (const originalMsg of assistantMessagesToReset) {
        const modelToSet =
          assistantMessagesToReset.length === 1 && !userMessageToResend?.mentions?.length
            ? assistant.model
            : originalMsg.model
        const blockIdsToDelete = [...(originalMsg.blocks || [])]
        const resetMsg = resetAssistantMessage(originalMsg, {
          status: AssistantMessageStatus.PENDING,
          updatedAt: new Date().toISOString(),
          model: modelToSet
        })

        resetDataList.push(resetMsg)
        allBlockIdsToDelete.push(...blockIdsToDelete)
        messagesToUpdateInRedux.push({
          topicId,
          messageId: resetMsg.id,
          updates: resetMsg
        })
      }

      // 再处理新的重传（用户消息提及，但是现有助手消息中不存在提及的模型）
      const originModelSet = new Set(assistantMessagesToReset.map((m) => m.model).filter((m) => m !== undefined))
      const mentionedModelSet = new Set(userMessageToResend.mentions ?? [])
      const newModelSet = new Set([...mentionedModelSet].filter((m) => !originModelSet.has(m)))
      for (const model of newModelSet) {
        const assistantMessage = createAssistantMessage(assistant.id, topicId, {
          askId: userMessageToResend.id,
          model: model,
          modelId: model.id
        })
        resetDataList.push(assistantMessage)
        dispatch(newMessagesActions.addMessage({ topicId, message: assistantMessage }))
      }

      messagesToUpdateInRedux.forEach((update) => dispatch(newMessagesActions.updateMessage(update)))
      cleanupMultipleBlocks(dispatch, allBlockIdsToDelete)
      // Manual bulkDelete path: decrement file references ourselves
      await cleanupBlocksFiles(allBlockIdsToDelete)

      try {
        if (allBlockIdsToDelete.length > 0) {
          await db.message_blocks.bulkDelete(allBlockIdsToDelete)
        }
        const finalMessagesToSave = selectMessagesForTopic(getState(), topicId)
        await updateTopicMessagesMerged(topicId, finalMessagesToSave)
      } catch (dbError) {
        logger.error('[resendMessageThunk] Error updating database:', dbError as Error)
      }

      // 中止该 askId 的在途流并等旧任务退出（否则旧流会继续向同一消息写块/覆盖状态）
      abortCompletion(userMessageToResend.id)
      await waitForTopicQueue(topicId)

      const queue = getTopicQueue(topicId)
      for (const resetMsg of resetDataList) {
        const assistantConfigForThisRegen = {
          ...assistant,
          ...(resetMsg.model ? { model: resetMsg.model } : {})
        }
        void queue.add(async () => {
          await fetchAndProcessAssistantResponseImpl(dispatch, getState, topicId, assistantConfigForThisRegen, resetMsg)
        })
      }
    } catch (error) {
      logger.error(`[resendMessageThunk] Error resending user message ${userMessageToResend.id}:`, error as Error)
    } finally {
      void finishTopicLoading(topicId)
    }
  }

/**
 * Thunk to resend a user message after its content has been edited.
 * Updates the user message's text block and then triggers the regeneration
 * of its associated assistant responses using resendMessageThunk.
 */
export const resendUserMessageWithEditThunk =
  (topicId: Topic['id'], originalMessage: Message, assistant: Assistant) => async (dispatch: AppDispatch) => {
    // Trigger the regeneration logic for associated assistant messages
    void dispatch(resendMessageThunk(topicId, originalMessage, assistant))
  }

/**
 * Thunk to regenerate a specific assistant response.
 */
export const regenerateAssistantResponseThunk =
  (topicId: Topic['id'], assistantMessageToRegenerate: Message, assistant: Assistant) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      const state = getState()

      // 1. Use selector to get all messages for the topic
      const allMessagesForTopic = selectMessagesForTopic(state, topicId)

      const askId = assistantMessageToRegenerate.askId

      if (!askId) {
        logger.error(
          `[appendAssistantResponseThunk] Existing assistant message ${assistantMessageToRegenerate.id} does not have an askId.`
        )
        return // Stop if askId is missing
      }

      if (!state.messages.entities[askId]) {
        logger.error(
          `[appendAssistantResponseThunk] Original user query (askId: ${askId}) not found in entities. Cannot create assistant response without corresponding user message.`
        )

        // Show error popup instead of creating error message block
        window.toast.error('无法切换模型响应：原始用户消息已被删除。请发送新消息以获取此模型的响应')

        return
      }

      // 2. Find the original user query (Restored Logic)
      const originalUserQuery = allMessagesForTopic.find((m) => m.id === assistantMessageToRegenerate.askId)
      if (!originalUserQuery) {
        logger.error(
          `[regenerateAssistantResponseThunk] Original user query (askId: ${assistantMessageToRegenerate.askId}) not found for assistant message ${assistantMessageToRegenerate.id}. Cannot regenerate.`
        )
        return
      }

      // 3. Verify the assistant message itself exists in entities
      const messageToResetEntity = state.messages.entities[assistantMessageToRegenerate.id]
      if (!messageToResetEntity) {
        // No need to check topicId again as selector implicitly handles it
        logger.error(
          `[regenerateAssistantResponseThunk] Assistant message ${assistantMessageToRegenerate.id} not found in entities despite being in the topic list. State might be inconsistent.`
        )
        return
      }

      // 4. Get Block IDs to delete
      const blockIdsToDelete = [...(messageToResetEntity.blocks || [])]

      // 5. Reset the message entity in Redux
      const resetAssistantMsg = resetAssistantMessage(
        messageToResetEntity,
        // Grouped message (mentioned model message) should not reset model and modelId, always use the original model
        assistantMessageToRegenerate.modelId
          ? {
              status: AssistantMessageStatus.PENDING,
              updatedAt: new Date().toISOString()
            }
          : {
              status: AssistantMessageStatus.PENDING,
              updatedAt: new Date().toISOString(),
              model: assistant.model
            }
      )

      dispatch(
        newMessagesActions.updateMessage({
          topicId,
          messageId: resetAssistantMsg.id,
          updates: resetAssistantMsg
        })
      )

      // 6. Remove old blocks from Redux
      cleanupMultipleBlocks(dispatch, blockIdsToDelete)
      // Manual bulkDelete path: decrement file references ourselves
      await cleanupBlocksFiles(blockIdsToDelete)

      // 7. Update DB: Save the reset message state within the topic and delete old blocks
      // Fetch the current state *after* Redux updates to get the latest message list
      // Use the selector to get the final ordered list of messages for the topic
      const finalMessagesToSave = selectMessagesForTopic(getState(), topicId)

      await db.transaction('rw', db.topics, db.message_blocks, async () => {
        // Merge with the persisted list instead of overwriting it
        const topic = await db.topics.get(topicId)
        if (topic) {
          await db.topics.update(topicId, { messages: mergeMessagesById(topic.messages ?? [], finalMessagesToSave) })
        }
        if (blockIdsToDelete.length > 0) {
          await db.message_blocks.bulkDelete(blockIdsToDelete)
        }
      })

      // 8. 中止该 askId 在途流并等旧任务退出（重新生成时旧流不能继续写同一消息）
      abortCompletion(askId)
      await waitForTopicQueue(topicId)

      // 9. Add fetch/process call to the queue
      const queue = getTopicQueue(topicId)
      const assistantConfigForRegen = {
        ...assistant,
        ...(resetAssistantMsg.model ? { model: resetAssistantMsg.model } : {})
      }
      void queue.add(async () => {
        await fetchAndProcessAssistantResponseImpl(
          dispatch,
          getState,
          topicId,
          assistantConfigForRegen,
          resetAssistantMsg
        )
      })
    } catch (error) {
      logger.error(
        `[regenerateAssistantResponseThunk] Error regenerating response for assistant message ${assistantMessageToRegenerate.id}:`,
        error as Error
      )
      // dispatch(newMessagesActions.setTopicLoading({ topicId, loading: false }))
    } finally {
      void finishTopicLoading(topicId)
    }
  }

// --- Thunk to initiate translation and create the initial block ---
export const initiateTranslationThunk =
  (
    messageId: string,
    topicId: string,
    targetLanguage: string,
    sourceBlockId?: string, // Optional: If known
    sourceLanguage?: string // Optional: If known
  ) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<string | undefined> => {
    // Return the new block ID
    try {
      const state = getState()
      const originalMessage = state.messages.entities[messageId]

      if (!originalMessage) {
        logger.error(`[initiateTranslationThunk] Original message ${messageId} not found.`)
        return undefined
      }

      // 1. Create the initial translation block (streaming state)
      const newBlock = createTranslationBlock(
        messageId,
        '', // Start with empty content
        targetLanguage,
        {
          status: MessageBlockStatus.STREAMING, // Set to STREAMING
          sourceBlockId,
          sourceLanguage
        }
      )

      // 2. Update Redux State
      const updatedBlockIds = [...(originalMessage.blocks || []), newBlock.id]
      dispatch(upsertOneBlock(newBlock)) // Add the new block
      dispatch(
        newMessagesActions.updateMessage({
          topicId,
          messageId,
          updates: { blocks: updatedBlockIds } // Update message's block list
        })
      )

      // 3. Update Database
      // Get the final message list from Redux state *after* updates
      const finalMessagesToSave = selectMessagesForTopic(getState(), topicId)

      await db.transaction('rw', db.topics, db.message_blocks, async () => {
        await db.message_blocks.put(newBlock) // Save the initial block
        const topic = await db.topics.get(topicId)
        if (topic) {
          await db.topics.update(topicId, { messages: mergeMessagesById(topic.messages ?? [], finalMessagesToSave) })
        }
      })
      return newBlock.id // Return the ID
    } catch (error) {
      logger.error(`[initiateTranslationThunk] Failed for message ${messageId}:`, error as Error)
      return undefined
      // Optional: Dispatch an error action or show notification
    }
  }

// --- Thunk to update the translation block with new content ---
export const updateTranslationBlockThunk =
  (blockId: string, accumulatedText: string, isComplete: boolean = false) =>
  async (dispatch: AppDispatch) => {
    // Logger.log(`[updateTranslationBlockThunk] 更新翻译块 ${blockId}, isComplete: ${isComplete}`)
    try {
      const status = isComplete ? MessageBlockStatus.SUCCESS : MessageBlockStatus.STREAMING
      const changes: Partial<MessageBlock> = {
        content: accumulatedText,
        status: status
      }

      // 更新Redux状态
      dispatch(updateOneBlock({ id: blockId, changes }))

      await updateSingleBlock(blockId, changes)
      // Logger.log(`[updateTranslationBlockThunk] Successfully updated translation block ${blockId}.`)
    } catch (error) {
      logger.error(`[updateTranslationBlockThunk] Failed to update translation block ${blockId}:`, error as Error)
    }
  }

/**
 * Thunk to append a new assistant response (using a potentially different model)
 * in reply to the same user query as an existing assistant message.
 */
export const appendAssistantResponseThunk =
  (
    topicId: Topic['id'],
    existingAssistantMessageId: string, // ID of the assistant message the user interacted with
    newModel: Model, // The new model selected by the user
    assistant: Assistant, // Base assistant configuration
    traceId?: string
  ) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    try {
      const state = getState()

      // 1. Find the existing assistant message to get the original askId
      const existingAssistantMsg = state.messages.entities[existingAssistantMessageId]
      if (!existingAssistantMsg) {
        logger.error(
          `[appendAssistantResponseThunk] Existing assistant message ${existingAssistantMessageId} not found.`
        )
        return // Stop if the reference message doesn't exist
      }
      if (existingAssistantMsg.role !== 'assistant') {
        logger.error(
          `[appendAssistantResponseThunk] Message ${existingAssistantMessageId} is not an assistant message.`
        )
        return // Ensure it's an assistant message
      }
      const askId = existingAssistantMsg.askId
      if (!askId) {
        logger.error(
          `[appendAssistantResponseThunk] Existing assistant message ${existingAssistantMessageId} does not have an askId.`
        )
        return // Stop if askId is missing
      }

      // (Optional but recommended) Verify the original user query exists
      if (!state.messages.entities[askId]) {
        logger.error(
          `[appendAssistantResponseThunk] Original user query (askId: ${askId}) not found in entities. Cannot create assistant response without corresponding user message.`
        )

        // Show error popup instead of creating error message block
        window.toast.error('无法切换模型响应：原始用户消息已被删除。请发送新消息以获取此模型的响应')

        return
      }

      // 2. Create the new assistant message stub
      const newAssistantMessageStub = createAssistantMessage(assistant.id, topicId, {
        askId: askId, // Crucial: Use the original askId
        model: newModel,
        modelId: newModel.id,
        traceId: traceId
      })

      // 3. Update Redux Store
      const currentTopicMessageIds = getState().messages.messageIdsByTopic[topicId] || []
      const existingMessageIndex = currentTopicMessageIds.findIndex((id) => id === existingAssistantMessageId)
      const insertAtIndex = existingMessageIndex !== -1 ? existingMessageIndex + 1 : currentTopicMessageIds.length

      // 4. Update Database (Save the stub to the topic's message list)
      await saveMessageAndBlocksToDB(topicId, newAssistantMessageStub, [], insertAtIndex)

      dispatch(
        newMessagesActions.insertMessageAtIndex({
          topicId,
          message: newAssistantMessageStub,
          index: insertAtIndex
        })
      )

      void dispatch(updateMessageAndBlocksThunk(topicId, { id: existingAssistantMessageId, foldSelected: false }, []))
      void dispatch(updateMessageAndBlocksThunk(topicId, { id: newAssistantMessageStub.id, foldSelected: true }, []))

      // 5. Prepare and queue the processing task
      const assistantConfigForThisCall = {
        ...assistant,
        model: newModel
      }
      const queue = getTopicQueue(topicId)
      void queue.add(async () => {
        await fetchAndProcessAssistantResponseImpl(
          dispatch,
          getState,
          topicId,
          assistantConfigForThisCall,
          newAssistantMessageStub // Pass the newly created stub
        )
      })
    } catch (error) {
      logger.error(`[appendAssistantResponseThunk] Error appending assistant response:`, error as Error)
      // Optionally dispatch an error action or notification
      // Resetting loading state should be handled by the underlying fetchAndProcessAssistantResponseImpl
    } finally {
      void finishTopicLoading(topicId)
    }
  }

/**
 * Clones messages from a source topic up to a specified index into a *pre-existing* new topic.
 * Generates new unique IDs for all cloned messages and blocks.
 * Updates the DB and Redux message/block state for the new topic.
 * Assumes the newTopic object already exists in Redux topic state and DB.
 * @param sourceTopicId The ID of the topic to branch from.
 * @param branchPointIndex The index *after* which messages should NOT be copied (slice endpoint).
 * @param newTopic The newly created Topic object (created and added to Redux/DB by the caller).
 */
export const cloneMessagesToNewTopicThunk =
  (
    sourceTopicId: string,
    branchPointIndex: number,
    newTopic: Topic // Receive newTopic object
  ) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<boolean> => {
    if (!newTopic || !newTopic.id) {
      logger.error(`[cloneMessagesToNewTopicThunk] Invalid newTopic provided.`)
      return false
    }
    try {
      const state = getState()
      const sourceMessages = selectMessagesForTopic(state, sourceTopicId)

      if (!sourceMessages || sourceMessages.length === 0) {
        logger.error(`[cloneMessagesToNewTopicThunk] Source topic ${sourceTopicId} not found or is empty.`)
        return false
      }

      // 1. Slice messages to clone
      const messagesToClone = sourceMessages.slice(0, branchPointIndex)
      if (messagesToClone.length === 0) {
        logger.warn(`[cloneMessagesToNewTopicThunk] No messages to branch (index ${branchPointIndex}).`)
        return true // Nothing to clone, operation considered successful but did nothing.
      }

      // 2. Prepare for cloning: Maps and Arrays
      const clonedMessages: Message[] = []
      const clonedBlocks: MessageBlock[] = []
      const filesToUpdateCount: FileMetadata[] = []
      const originalToNewMsgIdMap = new Map<string, string>() // Map original message ID -> new message ID

      // 3. First pass: Create ID mappings for all messages
      for (const oldMessage of messagesToClone) {
        const newMsgId = uuid()
        originalToNewMsgIdMap.set(oldMessage.id, newMsgId) // Store mapping for all cloned messages
      }

      // 4. Second pass: Clone Messages and Blocks with New IDs using complete mapping
      for (const oldMessage of messagesToClone) {
        const newMsgId = originalToNewMsgIdMap.get(oldMessage.id)!

        let newAskId: string | undefined = undefined // Initialize newAskId
        if (oldMessage.role === 'assistant' && oldMessage.askId) {
          // If it's an assistant message with an askId, find the NEW ID of the user message it references
          const mappedNewAskId = originalToNewMsgIdMap.get(oldMessage.askId)
          if (mappedNewAskId) {
            newAskId = mappedNewAskId // Use the new ID
          } else {
            // This happens if the user message corresponding to askId was *before* the branch point index
            // and thus wasn't included in messagesToClone or the map.
            // In this case, the link is broken in the new topic.
            logger.warn(
              `[cloneMessages] Could not find new ID mapping for original askId ${oldMessage.askId} (likely outside branch). Setting askId to undefined for new assistant message ${newMsgId}.`
            )
            // newAskId remains undefined
          }
        }

        // --- Clone Blocks ---
        const newBlockIds: string[] = []
        if (oldMessage.blocks && oldMessage.blocks.length > 0) {
          for (const oldBlockId of oldMessage.blocks) {
            const oldBlock = state.messageBlocks.entities[oldBlockId]
            if (oldBlock) {
              const newBlockId = uuid()
              const newBlock = {
                ...oldBlock,
                id: newBlockId,
                messageId: newMsgId // Link block to the NEW message ID
              }
              clonedBlocks.push(newBlock)
              newBlockIds.push(newBlockId)

              if (newBlock.type === MessageBlockType.FILE || newBlock.type === MessageBlockType.IMAGE) {
                const fileInfo = (newBlock as FileMessageBlock | ImageMessageBlock).file
                if (fileInfo) {
                  filesToUpdateCount.push(fileInfo)
                }
              }
            } else {
              logger.warn(
                `[cloneMessagesToNewTopicThunk] Block ${oldBlockId} not found in state for message ${oldMessage.id}. Skipping block clone.`
              )
            }
          }
        }

        // --- Create New Message Object ---
        const newMessage: Message = {
          ...oldMessage,
          id: newMsgId,
          topicId: newTopic.id, // Use the NEW topic ID provided
          blocks: newBlockIds // Use the NEW block IDs
        }
        if (newMessage.role === 'assistant') {
          newMessage.askId = newAskId // Use the mapped/updated askId
        }
        clonedMessages.push(newMessage)
      }

      // 5. Update Database (Atomic Transaction)
      await db.transaction('rw', db.topics, db.message_blocks, db.files, async () => {
        // Update the NEW topic with the cloned messages
        // Assumes topic entry was added by caller, so we UPDATE.
        await db.topics.put({ id: newTopic.id, messages: clonedMessages })

        // Add the NEW blocks
        if (clonedBlocks.length > 0) {
          await bulkAddBlocks(clonedBlocks)
        }
        // Update file counts
        const uniqueFiles = [...new Map(filesToUpdateCount.map((f) => [f.id, f])).values()]
        for (const file of uniqueFiles) {
          await updateFileCount(file.id, 1, false)
        }
      })

      // --- Update Redux State ---
      dispatch(
        newMessagesActions.messagesReceived({
          topicId: newTopic.id,
          messages: clonedMessages
        })
      )
      if (clonedBlocks.length > 0) {
        dispatch(upsertManyBlocks(clonedBlocks))
      }

      return true // Indicate success
    } catch (error) {
      logger.error(`[cloneMessagesToNewTopicThunk] Failed to clone messages:`, error as Error)
      return false // Indicate failure
    }
  }

/**
 * Thunk to edit properties of a message and/or its associated blocks.
 * Updates Redux state and persists changes to the database within a transaction.
 * Message updates are optional if only blocks need updating.
 */
export const updateMessageAndBlocksThunk =
  (
    topicId: string,
    // Allow messageUpdates to be optional or just contain the ID if only blocks are updated
    messageUpdates: (Partial<Message> & Pick<Message, 'id'>) | null, // ID is always required for context
    blockUpdatesList: MessageBlock[] // Block updates remain required for this thunk's purpose
  ) =>
  async (dispatch: AppDispatch): Promise<void> => {
    const messageId = messageUpdates?.id

    if (messageUpdates && !messageId) {
      logger.error('[updateMessageAndUpdateBlocksThunk] Message ID is required.')
      return
    }

    try {
      // 1. 更新 Redux Store
      if (messageUpdates && messageId) {
        // oxlint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: msgId, ...actualMessageChanges } = messageUpdates // Separate ID from actual changes

        // Only dispatch message update if there are actual changes beyond the ID
        if (Object.keys(actualMessageChanges).length > 0) {
          dispatch(
            newMessagesActions.updateMessage({
              topicId,
              messageId,
              updates: actualMessageChanges
            })
          )
        }
      }

      if (blockUpdatesList.length > 0) {
        dispatch(upsertManyBlocks(blockUpdatesList))
      }
      // Update message properties if provided
      if (messageUpdates && Object.keys(messageUpdates).length > 0 && messageId) {
        await updateMessage(topicId, messageId, messageUpdates)
      }
      // Update blocks if provided
      if (blockUpdatesList.length > 0) {
        await updateBlocks(blockUpdatesList)
      }

      dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`[updateMessageAndBlocksThunk] Failed to process updates for message ${messageId}:`, error as Error)
    }
  }

export const removeBlocksThunk =
  (topicId: string, messageId: string, blockIdsToRemove: string[]) =>
  async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    if (!blockIdsToRemove.length) {
      logger.warn('[removeBlocksThunk] No block IDs provided to remove.')
      return
    }

    try {
      const state = getState()
      const message = state.messages.entities[messageId]

      if (!message) {
        logger.error(`[removeBlocksThunk] Message ${messageId} not found in state.`)
        return
      }
      const blockIdsToRemoveSet = new Set(blockIdsToRemove)

      const updatedBlockIds = (message.blocks || []).filter((id) => !blockIdsToRemoveSet.has(id))

      // 1. Update Redux state
      dispatch(
        newMessagesActions.updateMessage({
          topicId,
          messageId,
          updates: { blocks: updatedBlockIds }
        })
      )
      cleanupMultipleBlocks(dispatch, blockIdsToRemove)
      // Manual bulkDelete path: decrement file references ourselves
      await cleanupBlocksFiles(blockIdsToRemove)

      // 2. Update database - use transaction for atomicity
      const finalMessagesToSave = selectMessagesForTopic(getState(), topicId)
      await db.transaction('rw', db.topics, db.message_blocks, async () => {
        const topic = await db.topics.get(topicId)
        if (topic) {
          await db.topics.update(topicId, { messages: mergeMessagesById(topic.messages ?? [], finalMessagesToSave) })
        }
        if (blockIdsToRemove.length > 0) {
          await db.message_blocks.bulkDelete(blockIdsToRemove)
        }
      })

      dispatch(updateTopicUpdatedAt({ topicId }))
    } catch (error) {
      logger.error(`[removeBlocksThunk] Failed to remove blocks from message ${messageId}:`, error as Error)
      throw error
    }
  }

//以下内容从原 messageThunk.v2.ts 迁移过来，原文件已经删除
//原因：v2.ts并不是v2数据重构的一部分，而相关命名对v2重构造成重大误解，故两文件合并，以消除误解

/**
 * Load messages for a topic using unified DbService
 */
export const loadTopicMessagesThunk =
  (topicId: string, forceReload: boolean = false) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState()

    dispatch(newMessagesActions.setCurrentTopicId(topicId))

    // Skip if already cached and not forcing reload
    if (!forceReload && state.messages.messageIdsByTopic[topicId]) {
      return
    }

    try {
      dispatch(newMessagesActions.setTopicLoading({ topicId, loading: true }))

      // Unified call via DbService
      const { messages, blocks } = await dbService.fetchMessages(topicId)

      logger.silly('Loaded messages via DbService', {
        topicId,
        messageCount: messages.length,
        blockCount: blocks.length
      })

      // Update Redux state with fetched data
      if (blocks.length > 0) {
        dispatch(upsertManyBlocks(blocks))
      }
      dispatch(newMessagesActions.messagesReceived({ topicId, messages }))
    } catch (error) {
      logger.error(`Failed to load messages for topic ${topicId}:`, error as Error)
      // Could dispatch an error action here if needed
    } finally {
      dispatch(newMessagesActions.setTopicLoading({ topicId, loading: false }))
    }
  }

/**
 * Get raw topic data using unified DbService
 * Returns topic with messages array
 */
export const getRawTopic = async (topicId: string): Promise<{ id: string; messages: Message[] } | undefined> => {
  try {
    const rawTopic = await dbService.getRawTopic(topicId)
    logger.silly('Retrieved raw topic via DbService', {
      topicId,
      found: !!rawTopic
    })
    return rawTopic
  } catch (error) {
    logger.error('Failed to get raw topic:', { topicId, error })
    return undefined
  }
}

/**
 * Update file reference count
 * Only applies to Dexie data source
 */
export const updateFileCount = async (fileId: string, delta: number, deleteIfZero: boolean = false): Promise<void> => {
  try {
    // Pass all parameters to dbService, including deleteIfZero
    await dbService.updateFileCount(fileId, delta, deleteIfZero)
    logger.silly('Updated file count', { fileId, delta, deleteIfZero })
  } catch (error) {
    logger.error('Failed to update file count:', { fileId, delta, error })
    throw error
  }
}

/**
 * Delete a single message from database
 */
export const deleteMessageFromDB = async (topicId: string, messageId: string): Promise<void> => {
  try {
    await dbService.deleteMessage(topicId, messageId)
    logger.silly('Deleted message via DbService', { topicId, messageId })
  } catch (error) {
    logger.error('Failed to delete message:', { topicId, messageId, error })
    throw error
  }
}

/**
 * Delete multiple messages from database
 */
export const deleteMessagesFromDB = async (topicId: string, messageIds: string[]): Promise<void> => {
  try {
    await dbService.deleteMessages(topicId, messageIds)
    logger.silly('Deleted messages via DbService', {
      topicId,
      count: messageIds.length
    })
  } catch (error) {
    logger.error('Failed to delete messages:', { topicId, messageIds, error })
    throw error
  }
}

/**
 * Clear all messages from a topic
 */
export const clearMessagesFromDB = async (topicId: string): Promise<void> => {
  try {
    await dbService.clearMessages(topicId)
    logger.silly('Cleared all messages via DbService', { topicId })
  } catch (error) {
    logger.error('Failed to clear messages:', { topicId, error })
    throw error
  }
}

/**
 * Save a message and its blocks to database
 * Uses the unified DbService interface
 */
export const saveMessageAndBlocksToDB = async (
  topicId: string,
  message: Message,
  blocks: MessageBlock[],
  messageIndex: number = -1
): Promise<void> => {
  try {
    const blockIds = blocks.map((block) => block.id)
    const shouldSyncBlocks =
      blockIds.length > 0 && (!message.blocks || blockIds.some((id, index) => message.blocks?.[index] !== id))

    const messageWithBlocks = shouldSyncBlocks ? { ...message, blocks: blockIds } : message
    // Direct call without conditional logic, now with messageIndex
    await dbService.appendMessage(topicId, messageWithBlocks, blocks, messageIndex)
    logger.silly('Saved message and blocks via DbService', {
      topicId,
      messageId: message.id,
      blockCount: blocks.length,
      messageIndex
    })
  } catch (error) {
    logger.error('Failed to save message and blocks:', {
      topicId,
      messageId: message.id,
      error
    })
    throw error
  }
}

/**
 * Update a message in the database
 */
export const updateMessage = async (topicId: string, messageId: string, updates: Partial<Message>): Promise<void> => {
  try {
    await dbService.updateMessage(topicId, messageId, updates)
    logger.silly('Updated message via DbService', { topicId, messageId })
  } catch (error) {
    logger.error('Failed to update message:', { topicId, messageId, error })
    throw error
  }
}

/**
 * Update a single message block
 */
export const updateSingleBlock = async (blockId: string, updates: Partial<MessageBlock>): Promise<void> => {
  try {
    await dbService.updateSingleBlock(blockId, updates)
    logger.silly('Updated single block via DbService', { blockId })
  } catch (error) {
    logger.error('Failed to update single block:', { blockId, error })
    throw error
  }
}

/**
 * Bulk add message blocks (for new blocks)
 */
export const bulkAddBlocks = async (blocks: MessageBlock[]): Promise<void> => {
  try {
    await dbService.bulkAddBlocks(blocks)
    logger.silly('Bulk added blocks via DbService', { count: blocks.length })
  } catch (error) {
    logger.error('Failed to bulk add blocks:', { count: blocks.length, error })
    throw error
  }
}

/**
 * Update multiple message blocks (upsert operation)
 */
export const updateBlocks = async (blocks: MessageBlock[]): Promise<void> => {
  try {
    await dbService.updateBlocks(blocks)
    logger.silly('Updated blocks via DbService', { count: blocks.length })
  } catch (error) {
    logger.error('Failed to update blocks:', { count: blocks.length, error })
    throw error
  }
}
