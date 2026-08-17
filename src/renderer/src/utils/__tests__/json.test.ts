import { describe, expect, it, vi } from 'vitest'

import { parseJSON } from '../index'

vi.mock('@renderer/store', () => ({
  default: {
    getState: () => ({
      llm: {
        settings: {}
      }
    })
  }
}))

describe('json', () => {
  describe('parseJSON', () => {
    it('should parse valid JSON string to object', () => {
      // 验证有效 JSON 字符串解析
      const result = parseJSON('{"key": "value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should return null for invalid JSON string', () => {
      // 验证无效 JSON 字符串返回 null
      const result = parseJSON('{invalid json}')
      expect(result).toBe(null)
    })
  })
})
