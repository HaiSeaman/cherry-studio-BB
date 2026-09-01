import { describe, expect, it } from 'vitest'

import { FALLBACK_DEFAULTS, getModelDefaults } from '../defaults'

describe('getModelDefaults', () => {
  it('bge 系列（8192 输入上限）推荐 512 切块', () => {
    const d = getModelDefaults('bge-m3')
    expect(d.chunk_size).toBe(512)
    expect(d.chunk_overlap).toBe(80)
    expect(d.top_k).toBe(6)
  })

  it('OpenAI text-embedding 系列同样 512 切块', () => {
    const d = getModelDefaults('text-embedding-3-small')
    expect(d.chunk_size).toBe(512)
  })

  it('qwen 长上下文系列推荐 1024 切块', () => {
    const d = getModelDefaults('qwen3-embedding-8b')
    expect(d.chunk_size).toBe(1024)
  })

  it('未知模型使用通用兜底默认', () => {
    expect(getModelDefaults('some-unknown-model')).toEqual(FALLBACK_DEFAULTS)
  })

  it('大小写不敏感', () => {
    expect(getModelDefaults('BGE-M3').chunk_size).toBe(512)
  })
})
