import {
  PAINT_ASPECT_RATIOS,
  PAINT_BATCH_OPTIONS,
  PAINT_ENHANCE_PROMPT,
  PAINT_RESOLUTION_TIERS,
  resolvePaintPixelSize
} from '@renderer/config/paint'
import { describe, expect, it } from 'vitest'

describe('paint config — 统一比例与档位选项', () => {
  it('比例列表唯一且包含常用比例', () => {
    expect(new Set(PAINT_ASPECT_RATIOS).size).toBe(PAINT_ASPECT_RATIOS.length)
    for (const ratio of ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9']) {
      expect(PAINT_ASPECT_RATIOS).toContain(ratio)
    }
  })

  it('档位列表为 自动/1K/2K/4K/512 且唯一', () => {
    const values = PAINT_RESOLUTION_TIERS.map((t) => t.value)
    expect(values).toEqual(['auto', '1K', '2K', '4K', '512'])
    expect(new Set(values).size).toBe(values.length)
  })

  it('提供 1/2/4 数量选项', () => {
    expect(PAINT_BATCH_OPTIONS).toEqual([1, 2, 4])
  })
})

describe('resolvePaintPixelSize — 比例×档位映射为合法像素', () => {
  it('1:1 + 1K → 1024x1024', () => {
    expect(resolvePaintPixelSize('1:1', '1K')).toBe('1024x1024')
  })

  it('16:9 + 2K 超出 2048 上限时夹紧长边（2048x1152）', () => {
    expect(resolvePaintPixelSize('16:9', '2K')).toBe('2048x1152')
  })

  it('1:1 + 4K 夹紧到 2048x2048（qwen-image 上限）', () => {
    expect(resolvePaintPixelSize('1:1', '4K')).toBe('2048x2048')
  })

  it('1:4 + 1K → 512x2048（正好落在边界内）', () => {
    expect(resolvePaintPixelSize('1:4', '1K')).toBe('512x2048')
  })

  it('16:9 + 512 短边低于 512 时放大短边（911x512）', () => {
    expect(resolvePaintPixelSize('16:9', '512')).toBe('911x512')
  })

  it('21:9 + 1K → 1564x670（宽比例不触发夹紧）', () => {
    expect(resolvePaintPixelSize('21:9', '1K')).toBe('1564x670')
  })

  it('自定义比例 7:3 正常计算', () => {
    expect(resolvePaintPixelSize('7:3', '1K')).toBe('1564x670')
  })

  it('档位为自动时返回 undefined（不传 size，由模型自行推荐）', () => {
    expect(resolvePaintPixelSize('16:9', 'auto')).toBeUndefined()
  })

  it('非法比例返回 undefined（含 0 值比例）', () => {
    expect(resolvePaintPixelSize('not-a-ratio', '1K')).toBeUndefined()
    expect(resolvePaintPixelSize('', '1K')).toBeUndefined()
    expect(resolvePaintPixelSize('0:1', '1K')).toBeUndefined()
    expect(resolvePaintPixelSize('8:0', '1K')).toBeUndefined()
  })

  it('极端比例 8:1 + 1K 长边夹紧到 2048 且不会被短边抬升再次推过上限', () => {
    // 理想值 2896x362 → 夹长边 2048x256；抬短边会得到 4096x512 超上限，故保持 2048x256
    expect(resolvePaintPixelSize('8:1', '1K')).toBe('2048x256')
    expect(resolvePaintPixelSize('1:8', '1K')).toBe('256x2048')
  })
})

describe('paint config — 优化提示词模板', () => {
  it('模板包含关键要求（英文输出、只输出提示词）', () => {
    expect(PAINT_ENHANCE_PROMPT).toContain('AI 绘画提示词')
    expect(PAINT_ENHANCE_PROMPT).toContain('只输出优化后的提示词')
  })
})
