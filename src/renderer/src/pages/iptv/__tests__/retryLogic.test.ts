import { describe, expect, it } from 'vitest'

import { initialRetry, onRetryError, onRetryPlaying } from '../services/retryLogic'

describe('retryLogic', () => {
  it('初始状态：未重试、未失败', () => {
    expect(initialRetry).toEqual({ attempt: 0, waitMs: 0, failed: false })
  })

  it('第 1/2/3 次错误 → 退避 1s/3s/5s', () => {
    let s = initialRetry
    s = onRetryError(s, true)
    expect(s).toMatchObject({ attempt: 1, waitMs: 1000, failed: false })
    s = onRetryError(s, true)
    expect(s).toMatchObject({ attempt: 2, waitMs: 3000, failed: false })
    s = onRetryError(s, true)
    expect(s).toMatchObject({ attempt: 3, waitMs: 5000, failed: false })
  })

  it('第 3 次重试后仍出错 → 最终失败', () => {
    let s = initialRetry
    for (let i = 0; i < 4; i++) s = onRetryError(s, true)
    expect(s.failed).toBe(true)
  })

  it('autoReconnect 关闭 → 出错直接失败（不消耗重试次数）', () => {
    const s = onRetryError(initialRetry, false)
    expect(s.failed).toBe(true)
    expect(s.attempt).toBe(0)
  })

  it('成功播放 → 全部复位', () => {
    let s = onRetryError(initialRetry, true)
    s = onRetryError(s, true)
    s = onRetryPlaying(s)
    expect(s).toEqual(initialRetry)
  })
})
