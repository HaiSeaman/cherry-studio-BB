import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  searchKnowledge: vi.fn(),
  isDedicatedImageGenerationModel: vi.fn(() => false)
}))

vi.mock('../search', () => ({ searchKnowledge: mocks.searchKnowledge }))

vi.mock('../../../config/models', () => ({
  isDedicatedImageGenerationModel: () => mocks.isDedicatedImageGenerationModel()
}))

const toastWarning = vi.fn()

import type { Model } from '@renderer/types'

import { knowledgeAttachStore } from '../knowledgeAttachStore'
import { attachKnowledgeContext, buildKnowledgeContext } from '../knowledgeContext'
import type { KBChunk, KBFile, KBHit, KnowledgeBase } from '../types'

const makeBase = (id: string): KnowledgeBase => ({
  id,
  name: id,
  embedding_model_id: 'embed-model',
  embedding_provider_id: 'p',
  embedding_dim: 4,
  chunk_size: 512,
  chunk_overlap: 80,
  top_k: 6,
  created_at: '',
  updated_at: ''
})

const hit = (id: string, file: string, text: string): KBHit => ({
  chunk: { id, text } as KBChunk,
  file: { name: file, path: `D:/docs/${file}` } as KBFile,
  score: 0.9
})

/** 按库 id 派发检索结果（模拟多库各自检索） */
const stubSearch = (byBase: Record<string, KBHit[]>) => {
  mocks.searchKnowledge.mockImplementation(async (base: KnowledgeBase) => byBase[base.id] ?? [])
}

describe('buildKnowledgeContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    knowledgeAttachStore.set([])
    vi.stubGlobal('toast', { warning: toastWarning })
  })

  it('未挂载知识库时不检索、不提示', async () => {
    expect(await buildKnowledgeContext('随便问问')).toEqual({ text: '', items: [] })
    expect(mocks.searchKnowledge).not.toHaveBeenCalled()
    expect(toastWarning).not.toHaveBeenCalled()
  })

  it('提问为空时不做检索', async () => {
    knowledgeAttachStore.set([makeBase('b1')])
    expect(await buildKnowledgeContext('   ')).toEqual({ text: '', items: [] })
    expect(mocks.searchKnowledge).not.toHaveBeenCalled()
  })

  it('检索无命中时不注入，并给出轻提示', async () => {
    knowledgeAttachStore.set([makeBase('b1')])
    stubSearch({})

    expect(await buildKnowledgeContext('今天几号')).toEqual({ text: '', items: [] })
    expect(toastWarning).toHaveBeenCalledTimes(1)
  })

  it('命中时拼装参考资料，且不含用户提问原文（提问只留在用户消息里）', async () => {
    knowledgeAttachStore.set([makeBase('b1')])
    stubSearch({ b1: [hit('c1', '手册.md', '产品的保修期是两年。')] })

    const { text, items } = await buildKnowledgeContext('保修多久')

    expect(text).toContain('[手册.md] 产品的保修期是两年。')
    expect(text).not.toContain('保修多久')
    expect(text).not.toContain('【用户问题】')
    expect(items).toEqual([
      { id: 'c1', file: '手册.md', path: 'D:/docs/手册.md', content: '产品的保修期是两年。', score: 0.9 }
    ])
  })

  it('多库合并：每个库都能出条目，不再被第一个库饿死', async () => {
    knowledgeAttachStore.set([makeBase('b1'), makeBase('b2')])
    stubSearch({
      b1: Array.from({ length: 10 }, (_, i) => hit(`a${i}`, '大库.md', `甲${i}`)),
      b2: [hit('z1', '小库.md', '乙1')]
    })

    const { items } = await buildKnowledgeContext('问题')

    expect(items.some((i) => i.content === '乙1')).toBe(true)
  })

  it('跨库按名次融合（RRF），库内名次高的排在前面', async () => {
    knowledgeAttachStore.set([makeBase('b1'), makeBase('b2')])
    stubSearch({
      b1: [hit('a1', 'A.md', '甲1'), hit('a2', 'A.md', '甲2'), hit('a3', 'A.md', '甲3')],
      b2: [hit('z1', 'B.md', '乙1'), hit('z2', 'B.md', '乙2')]
    })

    const { items } = await buildKnowledgeContext('问题')

    expect(items.map((i) => i.content)).toEqual(['甲1', '乙1', '甲2', '乙2', '甲3'])
  })

  it('跨库去重：相同内容的片段只保留一条', async () => {
    knowledgeAttachStore.set([makeBase('b1'), makeBase('b2')])
    stubSearch({
      b1: [hit('a1', '重复.md', '同一段内容')],
      b2: [hit('z1', '重复副本.md', '同一段内容')]
    })

    const { items, text } = await buildKnowledgeContext('问题')

    expect(items).toHaveLength(1)
    expect(text.match(/同一段内容/g)).toHaveLength(1)
  })

  it('参考片段总数封顶 8 块', async () => {
    knowledgeAttachStore.set([makeBase('b1'), makeBase('b2')])
    stubSearch({
      b1: Array.from({ length: 8 }, (_, i) => hit(`a${i}`, 'A.md', `甲${i}`)),
      b2: Array.from({ length: 8 }, (_, i) => hit(`z${i}`, 'B.md', `乙${i}`))
    })

    const { items } = await buildKnowledgeContext('问题')

    expect(items).toHaveLength(8)
  })

  it('单个库检索失败不影响其余库', async () => {
    knowledgeAttachStore.set([makeBase('b1'), makeBase('b2')])
    mocks.searchKnowledge.mockImplementation(async (base: KnowledgeBase) => {
      if (base.id === 'b1') throw new Error('库损坏')
      return [hit('z1', 'B.md', '可用片段')]
    })

    const { text } = await buildKnowledgeContext('问题')

    expect(text).toContain('[B.md] 可用片段')
  })
})

describe('attachKnowledgeContext', () => {
  const model = { id: 'm', provider: 'p', name: 'm' } as Model
  const makeSink = () => ({
    assistantMsgId: 'msg-1',
    blockManager: { handleBlockTransition: vi.fn().mockResolvedValue(undefined) }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDedicatedImageGenerationModel.mockReturnValue(false)
    knowledgeAttachStore.set([])
    vi.stubGlobal('toast', { warning: toastWarning })
  })

  it('返回 system 提示文本，并把命中片段挂成助手消息上的引用块', async () => {
    knowledgeAttachStore.set([makeBase('b1')])
    stubSearch({ b1: [hit('c1', '手册.md', '保修期是两年')] })
    const sink = makeSink()

    const text = await attachKnowledgeContext('保修多久', model, sink)

    expect(text).toContain('[手册.md] 保修期是两年')
    const [block, type] = sink.blockManager.handleBlockTransition.mock.calls[0]
    expect(block.messageId).toBe('msg-1')
    expect(block.knowledge).toEqual([
      { id: 'c1', file: '手册.md', path: 'D:/docs/手册.md', content: '保修期是两年', score: 0.9 }
    ])
    expect(type).toBe('citation')
  })

  it('没有命中时不挂引用块（只返回空提示文本）', async () => {
    knowledgeAttachStore.set([makeBase('b1')])
    stubSearch({})
    const sink = makeSink()

    expect(await attachKnowledgeContext('保修多久', model, sink)).toBe('')
    expect(sink.blockManager.handleBlockTransition).not.toHaveBeenCalled()
  })

  it('图像生成模型既不检索也不挂引用块', async () => {
    mocks.isDedicatedImageGenerationModel.mockReturnValue(true)
    knowledgeAttachStore.set([makeBase('b1')])
    const sink = makeSink()

    expect(await attachKnowledgeContext('保修多久', model, sink)).toBe('')
    expect(mocks.searchKnowledge).not.toHaveBeenCalled()
    expect(sink.blockManager.handleBlockTransition).not.toHaveBeenCalled()
  })
})
