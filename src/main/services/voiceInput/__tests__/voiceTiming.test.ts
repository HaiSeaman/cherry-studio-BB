import { describe, expect, it } from 'vitest'

import { formatVoiceTiming } from '../voiceTiming'

describe('formatVoiceTiming', () => {
  it('输出各阶段耗时（毫秒）', () => {
    const summary = formatVoiceTiming({
      start: 1000,
      firstAudio: 1420,
      firstResult: 1980,
      finalizeStart: 6000,
      finalizeEnd: 6310
    })

    expect(summary).toBe('按下→首块音频 420ms；按下→首次识别 980ms；松手→最终文本 310ms')
  })

  it('缺的节点显示 - ，且绝不出现 NaN', () => {
    const summary = formatVoiceTiming({ start: 1000, finalizeStart: 2000, finalizeEnd: 2000 })

    expect(summary).toBe('按下→首块音频 -；按下→首次识别 -；松手→最终文本 0ms')
    expect(summary).not.toContain('NaN')
  })

  it('一个时间戳都没有时也能安全输出', () => {
    const summary = formatVoiceTiming({})

    expect(summary).toBe('按下→首块音频 -；按下→首次识别 -；松手→最终文本 -')
  })
})
