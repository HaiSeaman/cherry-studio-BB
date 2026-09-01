import { describe, expect, it } from 'vitest'

import { assertDimensions, batchTexts, toFloat32Array } from '../embedding'

describe('batchTexts', () => {
  it('空数组返回空批次', () => {
    expect(batchTexts([], 32)).toEqual([])
  })

  it('文本数少于批次上限时合并为一批', () => {
    const texts = ['a', 'b', 'c']
    expect(batchTexts(texts, 32)).toEqual([texts])
  })

  it('超过批次上限时拆成多批，每批不超过上限且内容不丢失', () => {
    const texts = Array.from({ length: 100 }, (_, i) => `text-${i}`)
    const batches = batchTexts(texts, 32)
    expect(batches.length).toBe(Math.ceil(100 / 32)) // 4 批
    for (const b of batches) {
      expect(b.length).toBeLessThanOrEqual(32)
    }
    expect(batches.flat()).toEqual(texts)
  })

  it('批次上限非法时抛错', () => {
    expect(() => batchTexts(['a'], 0)).toThrow()
  })
})

describe('toFloat32Array', () => {
  it('number[][] 转 Float32Array[]', () => {
    const r = toFloat32Array([
      [1, 2, 3],
      [4, 5]
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toBeInstanceOf(Float32Array)
    expect(Array.from(r[0])).toEqual([1, 2, 3])
  })
})

describe('assertDimensions', () => {
  it('维度一致时不抛错', () => {
    expect(() => assertDimensions([new Float32Array(3), new Float32Array(3)], 3, 'm')).not.toThrow()
  })

  it('维度不一致时抛错并提示模型', () => {
    expect(() => assertDimensions([new Float32Array(3)], 1024, 'bge-m3')).toThrow(/1024/)
  })
})
