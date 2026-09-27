import { describe, expect, it, vi } from 'vitest'

import {
  clearTopicQueuePending,
  getTopicQueue,
  isAskIdCancelled,
  markCancelledAskIds,
  unmarkCancelledAskIds,
  waitForTopicQueue
} from '../queue'

describe('queue —— 取消排队中的生成任务', () => {
  it('mark/is/unmark 记录并清理 askId 取消标记', () => {
    expect(isAskIdCancelled('ask-1')).toBe(false)

    markCancelledAskIds(['ask-1', 'ask-2'])
    expect(isAskIdCancelled('ask-1')).toBe(true)
    expect(isAskIdCancelled('ask-2')).toBe(true)

    unmarkCancelledAskIds(['ask-1'])
    expect(isAskIdCancelled('ask-1')).toBe(false)
    expect(isAskIdCancelled('ask-2')).toBe(true)

    unmarkCancelledAskIds(['ask-2'])
    expect(isAskIdCancelled('ask-2')).toBe(false)
  })

  it('clearTopicQueuePending 丢弃未启动任务，但不打断正在运行的任务', async () => {
    const queue = getTopicQueue('topic-clear-pending')
    const started: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))

    // 占住 concurrency=1 的槽位
    const running = queue.add(async () => {
      started.push('running')
      await gate
    })
    await vi.waitFor(() => expect(started).toContain('running'))

    void queue.add(async () => {
      started.push('queued-1')
    })
    void queue.add(async () => {
      started.push('queued-2')
    })
    await vi.waitFor(() => expect(queue.size).toBe(2))

    clearTopicQueuePending('topic-clear-pending')
    expect(queue.size).toBe(0)

    release()
    await running
    await waitForTopicQueue('topic-clear-pending')

    // 只有正在运行的任务执行了，两个排队任务被丢弃
    expect(started).toEqual(['running'])
  })
})