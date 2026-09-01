import { describe, expect, it } from 'vitest'

import { cosine, rrfScore, tokenizeZh } from '../retriever'

describe('tokenizeZh', () => {
  it('纯中文产生单字 + 相邻 bigram', () => {
    const t = tokenizeZh('人工智能')
    expect(t).toContain('人工')
    expect(t).toContain('工智')
    expect(t).toContain('智能')
    expect(t).toContain('人')
  })

  it('英文按词切分（小写）', () => {
    const t = tokenizeZh('Hello World')
    expect(t).toContain('hello')
    expect(t).toContain('world')
  })

  it('中英混合同时保留', () => {
    const t = tokenizeZh('AI助手')
    expect(t).toContain('ai')
    expect(t).toContain('助手')
  })
})

describe('cosine', () => {
  it('相同向量相似度为 1', () => {
    expect(cosine(new Float32Array([1, 0, 0]), new Float32Array([1, 0, 0]))).toBeCloseTo(1)
  })

  it('正交向量为 0', () => {
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0)
  })

  it('维度不同返回 0', () => {
    expect(cosine(new Float32Array([1]), new Float32Array([1, 2]))).toBe(0)
  })
})

describe('rrfScore', () => {
  it('两路排名融合：出现在两路的项得分更高', () => {
    const s = rrfScore([
      ['a', 'b', 'c'],
      ['b', 'a', 'd']
    ])
    expect(s.get('a')!).toBeGreaterThan(s.get('c')!)
    expect(s.get('b')!).toBeGreaterThan(s.get('d')!)
    expect(s.get('a')!).toBeCloseTo(1 / 61 + 1 / 62) // rank 0 + rank 1
  })
})
