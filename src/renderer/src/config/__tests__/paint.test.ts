import { PAINT_BATCH_OPTIONS, PAINT_ENHANCE_PROMPT, PAINT_IMAGE_SIZES } from '@renderer/config/paint'
import { describe, expect, it } from 'vitest'

describe('paint config — 尺寸选项', () => {
  it('包含 1:1 / 16:9 / 9:16 三种尺寸且 value 唯一', () => {
    const values = PAINT_IMAGE_SIZES.map((s) => s.value)
    expect(values).toContain('1024x1024')
    expect(values).toContain('1344x768')
    expect(values).toContain('768x1344')
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('paint config — 数量选项', () => {
  it('提供 1/2/4 选项', () => {
    expect(PAINT_BATCH_OPTIONS).toEqual([1, 2, 4])
  })
})

describe('paint config — 优化提示词模板', () => {
  it('模板包含关键要求（英文输出、只输出提示词）', () => {
    expect(PAINT_ENHANCE_PROMPT).toContain('AI 绘画提示词')
    expect(PAINT_ENHANCE_PROMPT).toContain('只输出优化后的提示词')
  })
})
