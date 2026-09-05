import { describe, expect, it, vi } from 'vitest'

import { isValidProxyUrl, runAsyncFunction } from '../index'

vi.mock('@renderer/store', () => ({
  default: {
    getState: () => ({
      llm: {
        settings: {}
      }
    })
  }
}))

describe('Unclassified Utils', () => {
  describe('runAsyncFunction', () => {
    it('should execute async function', async () => {
      // 验证异步函数被执行
      let called = false
      await runAsyncFunction(async () => {
        called = true
      })
      expect(called).toBe(true)
    })

    it('should not throw if async function fails', async () => {
      // 实现语义：失败只记日志（logger.error），不向外抛出，调用方无需 try/catch
      await expect(
        runAsyncFunction(async () => {
          throw new Error('async error')
        })
      ).resolves.toBeUndefined()
    })
  })

  describe('isValidProxyUrl', () => {
    it('should return true for string containing "://"', () => {
      expect(isValidProxyUrl('http://localhost')).toBe(true)
      expect(isValidProxyUrl('socks5://127.0.0.1:1080')).toBe(true)
    })

    it('should return false for string not containing "://"', () => {
      expect(isValidProxyUrl('localhost')).toBe(false)
      expect(isValidProxyUrl('127.0.0.1:1080')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isValidProxyUrl('')).toBe(false)
    })

    it('should return true for only "://"', () => {
      expect(isValidProxyUrl('://')).toBe(true)
    })
  })
})
