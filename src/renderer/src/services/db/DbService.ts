/**
 * @deprecated Scheduled for removal in v2.0.0
 * --------------------------------------------------------------------------
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING (by 0xfullex)
 * --------------------------------------------------------------------------
 * STOP: Feature PRs affecting this file are currently BLOCKED.
 * Only critical bug fixes are accepted during this migration phase.
 *
 * This file is being refactored to v2 standards.
 * Any non-critical changes will conflict with the ongoing work.
 *
 * 🔗 Context & Status:
 * - Contribution Hold: https://github.com/CherryHQ/cherry-studio/issues/10954
 * - v2 Refactor PR   : https://github.com/CherryHQ/cherry-studio/pull/10162
 * --------------------------------------------------------------------------
 */
import { loggerService } from '@logger'
import store from '@renderer/store'
import type { Message, MessageBlock } from '@renderer/types/newMessage'

import { DexieMessageDataSource } from './DexieMessageDataSource'
import type { MessageDataSource } from './types'

const logger = loggerService.withContext('DbService')

/**
 * Facade service that routes data operations to the appropriate data source
 * based on the topic ID type (regular chat or agent session)
 */
class DbService implements MessageDataSource {
  private static instance: DbService
  private dexieSource: DexieMessageDataSource

  private constructor() {
    this.dexieSource = new DexieMessageDataSource()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DbService {
    if (!DbService.instance) {
      DbService.instance = new DbService()
    }
    return DbService.instance
  }

  /**
   * Get the active data source
   */
  private getDataSource(): MessageDataSource {
    return this.dexieSource
  }

  /**
   * Resolve topicId for a message
   */
  private resolveMessageTopicId(messageId: string): string | undefined {
    const state = store.getState()

    const parentMessage = state.messages.entities[messageId]
    if (parentMessage) {
      return parentMessage.topicId
    }

    return undefined
  }

  // ============ Read Operations ============

  async fetchMessages(
    topicId: string,
    forceReload?: boolean
  ): Promise<{
    messages: Message[]
    blocks: MessageBlock[]
  }> {
    const source = this.getDataSource()
    return source.fetchMessages(topicId, forceReload)
  }

  // ============ Write Operations ============
  async appendMessage(topicId: string, message: Message, blocks: MessageBlock[], insertIndex?: number): Promise<void> {
    const source = this.getDataSource()
    return source.appendMessage(topicId, message, blocks, insertIndex)
  }

  async updateMessage(topicId: string, messageId: string, updates: Partial<Message>): Promise<void> {
    const source = this.getDataSource()
    return source.updateMessage(topicId, messageId, updates)
  }

  async updateMessageAndBlocks(
    topicId: string,
    messageUpdates: Partial<Message> & Pick<Message, 'id'>,
    blocksToUpdate: MessageBlock[]
  ): Promise<void> {
    const source = this.getDataSource()
    return source.updateMessageAndBlocks(topicId, messageUpdates, blocksToUpdate)
  }

  async deleteMessage(topicId: string, messageId: string): Promise<void> {
    const source = this.getDataSource()
    return source.deleteMessage(topicId, messageId)
  }

  async deleteMessages(topicId: string, messageIds: string[]): Promise<void> {
    const source = this.getDataSource()
    return source.deleteMessages(topicId, messageIds)
  }

  // ============ Block Operations ============

  async updateBlocks(blocks: MessageBlock[]): Promise<void> {
    if (blocks.length === 0) {
      return
    }

    const topicId = this.resolveMessageTopicId(blocks[0].messageId)
    if (!topicId) {
      logger.warn(`Unable to resolve topicId for block ${blocks[0].id}, defaulting to Dexie`)
    }
    await this.dexieSource.updateBlocks(blocks)
  }

  async deleteBlocks(blockIds: string[]): Promise<void> {
    return this.dexieSource.deleteBlocks(blockIds)
  }

  // ============ Batch Operations ============

  async clearMessages(topicId: string): Promise<void> {
    const source = this.getDataSource()
    return source.clearMessages(topicId)
  }

  async topicExists(topicId: string): Promise<boolean> {
    const source = this.getDataSource()
    return source.topicExists(topicId)
  }

  async ensureTopic(topicId: string): Promise<void> {
    const source = this.getDataSource()
    return source.ensureTopic(topicId)
  }

  // ============ Optional Methods (with fallback) ============

  async getRawTopic(topicId: string): Promise<{ id: string; messages: Message[] } | undefined> {
    const source = this.getDataSource()
    return source.getRawTopic(topicId)
  }

  async updateSingleBlock(blockId: string, updates: Partial<MessageBlock>): Promise<void> {
    const state = store.getState()
    const existingBlock = state.messageBlocks.entities[blockId]

    if (!existingBlock) {
      logger.warn(`Block ${blockId} not found in state, defaulting to Dexie`)
      return this.dexieSource.updateSingleBlock(blockId, updates)
    }

    return this.dexieSource.updateSingleBlock(blockId, updates)
  }

  async bulkAddBlocks(blocks: MessageBlock[]): Promise<void> {
    return this.dexieSource.bulkAddBlocks(blocks)
  }

  async updateFileCount(fileId: string, delta: number, deleteIfZero: boolean = false): Promise<void> {
    // File operations only apply to Dexie source
    return this.dexieSource.updateFileCount(fileId, delta, deleteIfZero)
  }

  async updateFileCounts(files: Array<{ id: string; delta: number; deleteIfZero?: boolean }>): Promise<void> {
    // File operations only apply to Dexie source
    return this.dexieSource.updateFileCounts(files)
  }
}

// Export singleton instance
export const dbService = DbService.getInstance()

// Also export class for testing purposes
export { DbService }
