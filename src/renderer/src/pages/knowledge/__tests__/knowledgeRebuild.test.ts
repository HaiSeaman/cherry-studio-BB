import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bases: [] as any[],
  files: [] as any[],
  chunks: [] as any[],
  extractText: vi.fn(),
  embedTexts: vi.fn()
}))

const eq = (row: any, field: string, value: string) => row[field] === value

vi.mock('@renderer/databases', () => ({
  db: {
    kb_bases: { get: async (id: string) => mocks.bases.find((b) => b.id === id) },
    kb_files: {
      where: (field: string) => ({
        equals: (value: string) => ({
          toArray: async () => mocks.files.filter((f) => eq(f, field, value)),
          first: async () => mocks.files.find((f) => eq(f, field, value))
        })
      }),
      get: async (id: string) => mocks.files.find((f) => f.id === id),
      update: async (id: string, patch: any) => {
        const file = mocks.files.find((f) => f.id === id)
        if (file) Object.assign(file, patch)
      }
    },
    kb_chunks: {
      where: (field: string) => ({
        equals: (value: string) => ({
          toArray: async () => mocks.chunks.filter((c) => eq(c, field, value)),
          delete: async () => {
            mocks.chunks = mocks.chunks.filter((c) => !eq(c, field, value))
          }
        })
      }),
      add: async (row: any) => {
        mocks.chunks.push(row)
      }
    },
    transaction: async (_mode: string, ...args: any[]) => args[args.length - 1]()
  }
}))

vi.mock('../parser', () => ({
  extractText: (...args: any[]) => mocks.extractText(...args),
  computeContentHash: async () => 'hash',
  extractExt: () => '.md',
  SUPPORTED_EXTS: ['.md']
}))

vi.mock('../search', () => ({ invalidateIndex: vi.fn() }))

vi.mock('../../../aiCore/AiProvider', () => ({
  default: class {
    getEmbeddingDimensions() {
      return 4
    }
    embedTexts(texts: string[]) {
      return mocks.embedTexts(texts)
    }
  }
}))

import { KnowledgeService } from '../KnowledgeService'
import type { KnowledgeBase } from '../types'

const makeBase = (over: Partial<KnowledgeBase> = {}): KnowledgeBase => ({
  id: 'b',
  name: 'B',
  embedding_model_id: 'm',
  embedding_provider_id: 'p',
  embedding_dim: 4,
  chunk_size: 100,
  chunk_overlap: 0,
  top_k: 6,
  created_at: '',
  updated_at: '',
  ...over
})

const makeFile = (id: string) => ({
  id,
  base_id: 'b',
  name: `${id}.md`,
  path: `D:/docs/${id}.md`,
  ext: '.md',
  size: 10,
  content_hash: `hash-${id}`,
  status: 'ready',
  chunk_count: 2,
  created_at: '',
  updated_at: ''
})

describe('KnowledgeService.rebuildBase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bases = [makeBase()]
    mocks.files = [makeFile('f1'), makeFile('f2')]
    mocks.chunks = [
      { id: 'old1', base_id: 'b', file_id: 'f1', text: '旧块', vector: new Float32Array([1, 0, 0, 0]) },
      { id: 'old2', base_id: 'b', file_id: 'f2', text: '旧块', vector: new Float32Array([1, 0, 0, 0]) }
    ]
    mocks.extractText.mockResolvedValue({ text: '## 标题\n正文内容', kind: 'line' })
    mocks.embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => new Float32Array([1, 0, 0, 0])))
  })

  it('先清掉旧切块，再按当前参数重新解析并入库', async () => {
    const result = await KnowledgeService.rebuildBase('b')

    expect(result).toEqual({ rebuilt: 2, failed: 0 })
    // 旧块被清掉
    expect(mocks.chunks.some((c) => c.id === 'old1' || c.id === 'old2')).toBe(false)
    // 新块写回，且带上标题上下文
    expect(mocks.chunks).toHaveLength(2)
    expect(mocks.chunks[0].text).toContain('标题')
    expect(mocks.extractText).toHaveBeenCalledTimes(2)
    expect(mocks.files.every((f) => f.status === 'ready')).toBe(true)
  })

  it('单个文件重建失败标记 error，不影响其他文件', async () => {
    mocks.extractText.mockRejectedValueOnce(new Error('源文件已被移动'))

    const result = await KnowledgeService.rebuildBase('b')

    expect(result).toEqual({ rebuilt: 1, failed: 1 })
    const failed = mocks.files.find((f) => f.id === 'f1')!
    const ok = mocks.files.find((f) => f.id === 'f2')!
    expect(failed.status).toBe('error')
    expect(failed.error_message).toContain('源文件已被移动')
    expect(ok.status).toBe('ready')
    expect(mocks.chunks).toHaveLength(1)
  })
})
