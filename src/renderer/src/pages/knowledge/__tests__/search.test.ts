import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  embedTexts: vi.fn(),
  rerankDocuments: vi.fn(),
  makeRerankModel: vi.fn(() => null as any),
  chunks: [] as any[]
}))

vi.mock('@renderer/databases', () => ({
  db: {
    kb_chunks: { where: () => ({ equals: () => ({ toArray: async () => mocks.chunks }) }) },
    kb_files: {
      bulkGet: async (ids: string[]) => ids.map((id) => ({ id, name: `${id}.md` }))
    }
  }
}))

vi.mock('../KnowledgeService', () => ({
  makeModel: () => ({ id: 'embed-model', provider: 'p', name: 'embed-model', group: 'Embedding' }),
  makeRerankModel: () => mocks.makeRerankModel()
}))

vi.mock('../../../aiCore/AiProvider', () => ({
  default: class {
    embedTexts(texts: string[]) {
      return mocks.embedTexts(texts)
    }
    rerankDocuments(query: string, docs: string[], topN: number) {
      return mocks.rerankDocuments(query, docs, topN)
    }
  }
}))

import { invalidateIndex, MIN_RELEVANCE, searchKnowledge } from '../search'
import type { KnowledgeBase } from '../types'

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

/** 三个片段的词面都与查询「机器学习」相关，只有向量不同——用来验证门槛对两路都生效 */
const setChunks = () => {
  mocks.chunks = [
    {
      id: 'c1',
      base_id: 'b',
      file_id: 'f1',
      index: 0,
      text: '机器学习入门',
      vector: new Float32Array([1, 0, 0, 0]), // 与查询同向：cos = 1
      source: { type: 'line' },
      created_at: ''
    },
    {
      id: 'c2',
      base_id: 'b',
      file_id: 'f2',
      index: 1,
      text: '机器学习进阶',
      vector: new Float32Array([1, 4, 0, 0]), // cos ≈ 0.24，低于默认阈值
      source: { type: 'line' },
      created_at: ''
    },
    {
      id: 'c3',
      base_id: 'b',
      file_id: 'f3',
      index: 2,
      text: '机器学习实战',
      vector: new Float32Array([1, 1, 0, 0]), // cos ≈ 0.71，高于默认阈值
      source: { type: 'line' },
      created_at: ''
    }
  ]
}

describe('searchKnowledge 相关性门槛', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.makeRerankModel.mockReturnValue(null)
    setChunks()
    invalidateIndex('b')
  })

  it('低于阈值的片段被剔除（关键词命中也不例外）', async () => {
    // 查询向量与 c1 完全同向（1）、c3 约 0.71、c2 约 0.24
    mocks.embedTexts.mockResolvedValue([new Float32Array([1, 0, 0, 0])])

    const hits = await searchKnowledge(makeBase('b'), '机器学习')

    expect(hits.map((h) => h.chunk.id)).toEqual(['c1', 'c3'])
    expect(hits[0].score).toBeCloseTo(1)
    expect(MIN_RELEVANCE).toBeGreaterThan(0)
  })

  it('全部低于阈值时返回空（提问与库无关，不硬塞资料）', async () => {
    mocks.embedTexts.mockResolvedValue([new Float32Array([0, 0, 1, 0])])

    expect(await searchKnowledge(makeBase('b'), '机器学习')).toEqual([])
  })

  it('向量路失败时降级为关键词检索，不做语义门槛', async () => {
    mocks.embedTexts.mockRejectedValue(new Error('embedding 服务不可用'))

    const hits = await searchKnowledge(makeBase('b'), '机器学习')

    expect(hits).toHaveLength(3)
    // 无余弦可用时得分为 0，仅作占位
    expect(hits.every((h) => h.score === 0)).toBe(true)
  })

  it('空查询直接返回空，不触发向量化', async () => {
    expect(await searchKnowledge(makeBase('b'), '   ')).toEqual([])
    expect(mocks.embedTexts).not.toHaveBeenCalled()
  })

  it('阈值可下调：弱相关片段也能进入结果', async () => {
    mocks.embedTexts.mockResolvedValue([new Float32Array([1, 0, 0, 0])])

    expect((await searchKnowledge(makeBase('b'), '机器学习')).map((h) => h.chunk.id)).toEqual(['c1', 'c3'])

    const relaxed = await searchKnowledge({ ...makeBase('b'), min_relevance: 0.2 }, '机器学习')
    expect(relaxed.map((h) => h.chunk.id)).toEqual(['c1', 'c3', 'c2'])
  })

  it('阈值可上调：相关度不足的片段被剔除', async () => {
    mocks.embedTexts.mockResolvedValue([new Float32Array([1, 0, 0, 0])])

    const strict = await searchKnowledge({ ...makeBase('b'), min_relevance: 0.8 }, '机器学习')
    expect(strict.map((h) => h.chunk.id)).toEqual(['c1'])
  })
})

describe('searchKnowledge 重排候选池', () => {
  const manyChunks = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `k${i}`,
      base_id: 'b',
      file_id: `f${i}`,
      index: i,
      text: `片段${i}`,
      vector: new Float32Array([1, 0, 0, 0]),
      source: { type: 'line' },
      created_at: ''
    }))

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.chunks = manyChunks(80)
    invalidateIndex('b')
    mocks.embedTexts.mockResolvedValue([new Float32Array([1, 0, 0, 0])])
  })

  it('没配重排模型时只取 TopK×2 候选（不为重排多花算力）', async () => {
    mocks.makeRerankModel.mockReturnValue(null)

    const hits = await searchKnowledge({ ...makeBase('b'), top_k: 6 }, '片段')
    expect(hits).toHaveLength(6)
    expect(mocks.rerankDocuments).not.toHaveBeenCalled()
  })

  it('配了重排模型时把候选池扩到 50 条再精排', async () => {
    mocks.makeRerankModel.mockReturnValue({ id: 'rr', provider: 'p', name: 'rr', group: 'Rerank' })
    mocks.rerankDocuments.mockResolvedValue([{ index: 0, score: 0.9 }])

    await searchKnowledge({ ...makeBase('b'), top_k: 6 }, '片段')

    const docs = mocks.rerankDocuments.mock.calls[0][1] as string[]
    expect(docs).toHaveLength(50)
  })
})
