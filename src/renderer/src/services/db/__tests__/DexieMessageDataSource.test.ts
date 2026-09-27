import { beforeEach, describe, expect, it, vi } from 'vitest'

// 用单一 order 数组记录调用顺序：事务必须在删除物理文件之前结束，
// 否则事务内 await IPC 会让 Dexie 提前提交事务并抛 "transaction already committed"。
const h = vi.hoisted(() => {
  const order: string[] = []

  const deleteFile = vi.fn(async () => {
    order.push('deleteFile')
  })

  const transaction = vi.fn(async (...args: any[]) => {
    order.push('tx:start')
    const cb = args[args.length - 1]
    const result = typeof cb === 'function' ? await cb() : undefined
    order.push('tx:end')
    return result
  })

  const topics = {
    get: vi.fn(),
    update: vi.fn()
  }

  const message_blocks = {
    where: vi.fn(),
    bulkDelete: vi.fn()
  }

  return { order, deleteFile, transaction, topics, message_blocks }
})

vi.mock('@renderer/databases', () => ({
  default: {
    topics: h.topics,
    message_blocks: h.message_blocks,
    transaction: h.transaction
  }
}))

vi.mock('@renderer/services/FileManager', () => ({
  default: { deleteFile: h.deleteFile }
}))

vi.mock('@renderer/store', () => ({
  default: { dispatch: vi.fn() }
}))

vi.mock('@renderer/store/assistants', () => ({
  updateTopicUpdatedAt: vi.fn(() => ({ type: 'UPDATE_TOPIC_UPDATED_AT' }))
}))

import { DexieMessageDataSource } from '../DexieMessageDataSource'

const stubBlocks = (blocks: any[]) => {
  h.message_blocks.where.mockReturnValue({
    anyOf: vi.fn(() => ({ toArray: vi.fn(async () => blocks) }))
  })
}

describe('DexieMessageDataSource 删除消息时的文件清理', () => {
  beforeEach(() => {
    h.order.length = 0
    vi.clearAllMocks()
  })

  it('deleteMessage：物理文件在事务提交之后才删除', async () => {
    h.topics.get.mockResolvedValue({ id: 'topic-1', messages: [{ id: 'msg-1', blocks: ['blk-1'] }] })
    stubBlocks([{ id: 'blk-1', type: 'file', file: { id: 'file-1' } }])

    await new DexieMessageDataSource().deleteMessage('topic-1', 'msg-1')

    expect(h.order).toEqual(['tx:start', 'tx:end', 'deleteFile'])
    expect(h.deleteFile).toHaveBeenCalledWith('file-1', false)
    expect(h.message_blocks.bulkDelete).toHaveBeenCalledWith(['blk-1'])
  })

  it('deleteMessages：物理文件在事务提交之后才删除', async () => {
    h.topics.get.mockResolvedValue({
      id: 'topic-1',
      messages: [
        { id: 'msg-1', blocks: ['blk-1'] },
        { id: 'msg-2', blocks: ['blk-2'] }
      ]
    })
    stubBlocks([
      { id: 'blk-1', type: 'image', file: { id: 'file-1' } },
      { id: 'blk-2', type: 'file', file: { id: 'file-2' } }
    ])

    await new DexieMessageDataSource().deleteMessages('topic-1', ['msg-1', 'msg-2'])

    expect(h.order).toEqual(['tx:start', 'tx:end', 'deleteFile', 'deleteFile'])
    expect(h.deleteFile).toHaveBeenCalledWith('file-1', false)
    expect(h.deleteFile).toHaveBeenCalledWith('file-2', false)
    expect(h.message_blocks.bulkDelete).toHaveBeenCalledWith(['blk-1', 'blk-2'])
  })

  it('deleteMessage：非文件类块不触发文件删除', async () => {
    h.topics.get.mockResolvedValue({ id: 'topic-1', messages: [{ id: 'msg-1', blocks: ['blk-1'] }] })
    stubBlocks([{ id: 'blk-1', type: 'main_text', content: 'hi' }])

    await new DexieMessageDataSource().deleteMessage('topic-1', 'msg-1')

    expect(h.order).toEqual(['tx:start', 'tx:end'])
    expect(h.deleteFile).not.toHaveBeenCalled()
  })
})