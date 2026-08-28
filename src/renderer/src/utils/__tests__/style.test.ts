import { describe, expect, it } from 'vitest'

import { generateColorFromChar } from '../style'

describe('style', () => {
  describe('generateColorFromChar', () => {
    it('should generate a valid hex color code', () => {
      // 验证生成有效的十六进制颜色代码
      const result = generateColorFromChar('A')
      expect(result).toMatch(/^#[0-9a-fA-F]{6}$/)
    })

    it('should generate consistent color for same input', () => {
      // 验证相同输入生成一致的颜色
      const result1 = generateColorFromChar('A')
      const result2 = generateColorFromChar('A')
      expect(result1).toBe(result2)
    })

    it('should generate different colors for different inputs', () => {
      // 验证不同输入生成不同的颜色
      const result1 = generateColorFromChar('A')
      const result2 = generateColorFromChar('B')
      expect(result1).not.toBe(result2)
    })
  })
})
