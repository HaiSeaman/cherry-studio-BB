import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSmoothStream } from '../useSmoothStream'

/**
 * useSmoothStream 流式渲染频率控制测试：
 * - 渲染必须受 minDelay 节流（不能每帧都触发 onUpdate → 60fps 全量 Markdown 重解析）
 * - 队列必须排空（不能积压导致内存增长）
 */
describe('useSmoothStream', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance']
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('节流：minDelay 窗口内多次 addChunk 只触发一次 onUpdate，且内容合并完整', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() => useSmoothStream({ onUpdate, streamDone: false }))

    // 队列空时不应空转（无 onUpdate）
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onUpdate).not.toHaveBeenCalled()

    // 首次 addChunk：距上次渲染已远超窗口，下一帧即渲染一次
    act(() => {
      result.current.addChunk('你好世界')
      vi.advanceTimersByTime(16)
    })
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenLastCalledWith('你好世界')

    // 窗口内（66ms）追加内容：中间帧全部被节流吞掉，不触发渲染
    act(() => {
      result.current.addChunk('，今天天气很好')
      vi.advanceTimersByTime(48)
    })
    expect(onUpdate).toHaveBeenCalledTimes(1)

    // 满窗口后：合并后的完整内容一次渲染
    act(() => {
      vi.advanceTimersByTime(32)
    })
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenLastCalledWith('你好世界，今天天气很好')
  })

  it('流结束后一次性渲染全部剩余内容', () => {
    const onUpdate = vi.fn()
    const { result, rerender } = renderHook(
      ({ streamDone }) => useSmoothStream({ onUpdate, streamDone, minDelay: 30 }),
      { initialProps: { streamDone: false } }
    )

    act(() => {
      result.current.addChunk('第一段')
      vi.advanceTimersByTime(100)
    })
    expect(onUpdate).toHaveBeenLastCalledWith('第一段')

    // 流结束：剩余内容一次性补齐，不再逐帧渲染
    act(() => {
      result.current.addChunk('第二段')
      rerender({ streamDone: true })
      vi.advanceTimersByTime(200)
    })
    expect(onUpdate).toHaveBeenLastCalledWith('第一段第二段')
    // 结束后的空转不产生额外 onUpdate
    const callsAfterDone = onUpdate.mock.calls.length
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onUpdate.mock.calls.length).toBe(callsAfterDone)
  })
})
