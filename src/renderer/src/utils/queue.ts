import PQueue from 'p-queue'

// Queue configuration - managed by topic
const requestQueues: { [topicId: string]: PQueue } = {}

/**
 * Get or create a queue for a specific topic
 * @param topicId The ID of the topic
 * @param options
 * @returns A PQueue instance for the topic
 *
 * 同一话题的生成任务串行执行（concurrency=1）：多条消息连发/多模型 @ 时
 * 并发流会互相交错写消息与块状态（上下文缺消息、顺序错乱、节流 RAF 抢占），
 * 也是流式卡顿的来源之一。waitForTopicQueue/finishTopicLoading 的语义本就假设串行。
 */
export const getTopicQueue = (topicId: string, options = {}): PQueue => {
  if (!requestQueues[topicId]) {
    requestQueues[topicId] = new PQueue({ concurrency: 1, ...options })
  }
  return requestQueues[topicId]
}

/**
 * Clear the queue for a specific topic
 * @param topicId The ID of the topic
 */
export const clearTopicQueue = (topicId: string): void => {
  if (requestQueues[topicId]) {
    requestQueues[topicId].clear()
    delete requestQueues[topicId]
  }
}

/**
 * Clear only the not-yet-started tasks of a topic queue, keeping the queue
 * instance (and any running task) intact.
 * 用于「停止 / 清空话题」时丢弃排队中的生成任务，避免它们照常启动继续烧 token。
 * @param topicId The ID of the topic
 */
export const clearTopicQueuePending = (topicId: string): void => {
  requestQueues[topicId]?.clear()
}

/**
 * askIds 已被「停止 / 清空话题」取消、但可能已从 PQueue 取出尚未进入函数体的标记集合。
 * concurrency=1 的队列只会丢弃 pending 任务，仍有极小竞态窗口，入口据此兜底直接返回。
 */
const cancelledAskIds = new Set<string>()

export const markCancelledAskIds = (askIds: string[]): void => {
  for (const id of askIds) {
    cancelledAskIds.add(id)
  }
}

export const isAskIdCancelled = (askId: string): boolean => cancelledAskIds.has(askId)

export const unmarkCancelledAskIds = (askIds: string[]): void => {
  for (const id of askIds) {
    cancelledAskIds.delete(id)
  }
}

/**
 * Check if a topic has pending requests
 * @param topicId The ID of the topic
 * @returns True if the topic has pending requests
 */
export const hasTopicPendingRequests = (topicId: string): boolean => {
  return requestQueues[topicId]?.size > 0 || requestQueues[topicId]?.pending > 0
}

/**
 * Wait for all pending requests in a topic queue to complete
 * @param topicId The ID of the topic
 */
export const waitForTopicQueue = async (topicId: string): Promise<void> => {
  if (requestQueues[topicId]) {
    await requestQueues[topicId].onIdle()
  }
}
