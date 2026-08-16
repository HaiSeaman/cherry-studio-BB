import { loggerService } from '@logger'
import db from '@renderer/databases'
import { fetchMessagesSummary } from '@renderer/services/ApiService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { safeDeleteFiles } from '@renderer/services/MessagesService'
import store from '@renderer/store'
import { updateTopic } from '@renderer/store/assistants'
import { removeManyBlocks } from '@renderer/store/messageBlock'
import { newMessagesActions, selectMessagesForTopic } from '@renderer/store/newMessage'
import { setNewlyRenamedTopics, setRenamingTopics } from '@renderer/store/runtime'
import { loadTopicMessagesThunk } from '@renderer/store/thunk/messageThunk'
import type { Assistant, FileMetadata, Topic } from '@renderer/types'
import type { FileMessageBlock, ImageMessageBlock } from '@renderer/types/newMessage'
import { MessageBlockType } from '@renderer/types/newMessage'
import { abortCompletion } from '@renderer/utils/abortController'
import { findMainTextBlocks } from '@renderer/utils/messageUtils/find'
import { truncateText } from '@renderer/utils/naming'
import { clearTopicQueue } from '@renderer/utils/queue'
import { find, isEmpty } from 'lodash'
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'

import { useAssistant } from './useAssistant'
import { getStoreSetting } from './useSettings'

/** 获取话题全部消息块的 id（用于删除话题时清理 Redux 块实体） */
async function getBlockIdsForTopic(topicId: string): Promise<string[]> {
  const topic = await db.topics.get(topicId)
  if (!topic) return []
  const messageIds = topic.messages.map((m) => m.id)
  if (messageIds.length === 0) return []
  const blocks = await db.message_blocks.where('messageId').anyOf(messageIds).toArray()
  return blocks.map((b) => b.id)
}

let _activeTopic: Topic
let _setActiveTopic: Dispatch<SetStateAction<Topic>>

const logger = loggerService.withContext('useTopic')

/**
 * 中止话题的所有在途流。abort 注册按 askId（userMessageId）存，删除/清空话题时
 * 必须逐个 askId abort，否则在途流会继续向已删除/已清空的话题写孤儿消息与块。
 */
function abortTopicStreams(topicId: string): void {
  const messages = selectMessagesForTopic(store.getState(), topicId)
  const askIds = [...new Set((messages ?? []).map((m) => m.askId).filter((id): id is string => !!id))]
  for (const askId of askIds) {
    abortCompletion(askId)
  }
}

export function useActiveTopic(assistantId: string, topic?: Topic) {
  const { assistant } = useAssistant(assistantId)
  const [activeTopic, setActiveTopic] = useState(topic || _activeTopic || assistant?.topics[0])

  _activeTopic = activeTopic
  _setActiveTopic = setActiveTopic

  useEffect(() => {
    if (activeTopic) {
      void store.dispatch(loadTopicMessagesThunk(activeTopic.id))
      void EventEmitter.emit(EVENT_NAMES.CHANGE_TOPIC, activeTopic)
    }
  }, [activeTopic])

  useEffect(() => {
    // activeTopic not in assistant.topics
    // 确保 assistant 和 assistant.topics 存在，避免在数据未完全加载时访问属性
    if (
      assistant &&
      assistant.topics &&
      Array.isArray(assistant.topics) &&
      assistant.topics.length > 0 &&
      !find(assistant.topics, { id: activeTopic?.id })
    ) {
      setActiveTopic(assistant.topics[0])
    }
  }, [activeTopic?.id, assistant])

  useEffect(() => {
    if (!assistant?.topics?.length || !activeTopic) {
      return
    }

    const latestTopic = assistant.topics.find((item) => item.id === activeTopic.id)
    if (latestTopic && latestTopic !== activeTopic) {
      setActiveTopic(latestTopic)
    }
  }, [assistant?.topics, activeTopic])

  return { activeTopic, setActiveTopic }
}

export function useTopic(assistant: Assistant, topicId?: string) {
  return assistant?.topics.find((topic) => topic.id === topicId)
}

export function getTopic(assistant: Assistant, topicId: string) {
  return assistant?.topics.find((topic) => topic.id === topicId)
}

export async function getTopicById(topicId: string) {
  const assistants = store.getState().assistants.assistants
  const topics = assistants.map((assistant) => assistant.topics).flat()
  const topic = topics.find((topic) => topic.id === topicId)
  const messages = await TopicManager.getTopicMessages(topicId)
  return { ...topic, messages } as Topic
}

/**
 * 开始重命名指定话题
 */
export const startTopicRenaming = (topicId: string) => {
  const currentIds = store.getState().runtime.chat.renamingTopics
  if (!currentIds.includes(topicId)) {
    store.dispatch(setRenamingTopics([...currentIds, topicId]))
  }
}

/**
 * 完成重命名指定话题
 */
export const finishTopicRenaming = (topicId: string) => {
  const state = store.getState()

  // 1. 立即从 renamingTopics 移除
  const currentRenaming = state.runtime.chat.renamingTopics
  store.dispatch(setRenamingTopics(currentRenaming.filter((id) => id !== topicId)))

  // 2. 立即添加到 newlyRenamedTopics
  const currentNewlyRenamed = state.runtime.chat.newlyRenamedTopics
  store.dispatch(setNewlyRenamedTopics([...currentNewlyRenamed, topicId]))

  // 3. 延迟从 newlyRenamedTopics 移除
  setTimeout(() => {
    const current = store.getState().runtime.chat.newlyRenamedTopics
    store.dispatch(setNewlyRenamedTopics(current.filter((id) => id !== topicId)))
  }, 700)
}

const topicRenamingLocks = new Set<string>()

export const autoRenameTopic = async (assistant: Assistant, topicId: string) => {
  if (topicRenamingLocks.has(topicId)) {
    return
  }

  try {
    topicRenamingLocks.add(topicId)

    const topic = await getTopicById(topicId)
    const enableTopicNaming = getStoreSetting('enableTopicNaming')

    if (isEmpty(topic.messages)) {
      return
    }

    if (topic.isNameManuallyEdited) {
      return
    }

    const applyTopicName = (name: string) => {
      const data = { ...topic, name } as Topic
      if (topic.id === _activeTopic.id) {
        _setActiveTopic(data)
      }
      store.dispatch(updateTopic({ assistantId: assistant.id, topic: data }))
    }

    const getFirstMessageName = () => {
      const message = topic.messages[0]
      const blocks = findMainTextBlocks(message)
      const text = blocks
        .map((block) => block.content)
        .join('\n\n')
        .trim()

      return truncateText(text)
    }

    if (!enableTopicNaming) {
      const topicName = getFirstMessageName()
      if (topicName) {
        try {
          startTopicRenaming(topicId)
          applyTopicName(topicName)
        } finally {
          finishTopicRenaming(topicId)
        }
      }
      return
    }

    if (topic && topic.name === '默认话题' && topic.messages.length >= 2) {
      startTopicRenaming(topicId)
      try {
        const { text: summaryText, error } = await fetchMessagesSummary({ messages: topic.messages })
        if (summaryText) {
          applyTopicName(summaryText)
        } else {
          if (error) {
            window.toast?.error(`${'话题命名失败'}: ${error}`)
          }
          const fallbackName = getFirstMessageName()
          if (fallbackName) {
            applyTopicName(fallbackName)
          }
        }
      } finally {
        finishTopicRenaming(topicId)
      }
    }
  } finally {
    topicRenamingLocks.delete(topicId)
  }
}

// Convert class to object with functions since class only has static methods
// 只有静态方法,没必要用class，可以export {}
export const TopicManager = {
  async getTopic(id: string) {
    return await db.topics.get(id)
  },

  async getAllTopics() {
    return await db.topics.toArray()
  },

  /**
   * 加载并返回指定话题的消息
   */
  async getTopicMessages(id: string) {
    const topic = await TopicManager.getTopic(id)
    if (!topic) return []

    await store.dispatch(loadTopicMessagesThunk(id))

    // 获取更新后的话题
    const updatedTopic = await TopicManager.getTopic(id)
    return updatedTopic?.messages || []
  },

  async removeTopic(id: string) {
    // 中止在途流：abort 注册按 askId 存（messageThunk 以 userMessageId 注册），
    // 直接 abortCompletion(id) 找不到条目，流会继续向已删除话题写孤儿块
    abortTopicStreams(id)
    // Release the topic's request queue so its PQueue instance (and the 'idle'
    // endTrace listener) does not stay in memory forever.
    clearTopicQueue(id)
    // 删除前先取块 id（DB 删除后无法再查询）
    const blockIds = await getBlockIdsForTopic(id).catch(() => [])
    await TopicManager.clearTopicMessages(id)
    await db.topics.delete(id)
    // 清理 Redux 中该话题的消息与块实体，避免随话题增删无界增长
    store.dispatch(newMessagesActions.clearTopicMessages(id))
    store.dispatch(removeManyBlocks(blockIds))
  },

  async clearTopicMessages(id: string): Promise<void> {
    // 中止在途流：清空消息后流仍在写的话会立即重建消息，清空等于没清
    abortTopicStreams(id)
    // 暂存需要删除的文件信息
    let filesToDelete: FileMetadata[] = []

    try {
      await db.transaction('rw', [db.topics, db.message_blocks], async () => {
        const topic = await db.topics.get(id)

        if (!topic || !topic.messages || topic.messages.length === 0) {
          return
        }

        const blockIds = topic.messages.flatMap((message) => message.blocks || [])

        if (blockIds.length > 0) {
          // 删除 block 之前先从 DB 里找出来
          const blocks = await db.message_blocks.where('id').anyOf(blockIds).toArray()

          // 提取文件元数据（块级 file 字段 + 生成图批量落盘的 generatedFiles，均需回收）
          filesToDelete = blocks
            .filter(
              (block): block is ImageMessageBlock | FileMessageBlock =>
                block.type === MessageBlockType.IMAGE || block.type === MessageBlockType.FILE
            )
            .flatMap((block) => {
              const generatedFiles = block.type === MessageBlockType.IMAGE ? (block.metadata?.generatedFiles ?? []) : []
              return [block.file, ...generatedFiles]
            })
            .filter((file) => file !== undefined)

          await db.message_blocks.bulkDelete(blockIds)
        }

        await db.topics.update(id, { messages: [] })
      })
    } catch (dbError) {
      logger.error(`Failed to clear database records for topic ${id}:`, dbError as Error)
      throw dbError
    }

    // 删除文件
    if (filesToDelete.length > 0) {
      await safeDeleteFiles(filesToDelete)
    }
  }
}
