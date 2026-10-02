import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPressHoldDetector } from '../pressHoldDetector'

// 任意三个 keycode 代表"目标组合键"（Meta / Shift / Backquote 的真实 keycode 由 keyboardHook 传入）
const [META, SHIFT, BACKQUOTE] = [10, 20, 30]

const keyDown = (keycode: number) => ({ keycode, metaKey: false, shiftKey: false, ctrlKey: false, altKey: false })
const keyUp = (keycode: number) => ({ keycode, metaKey: false, shiftKey: false, ctrlKey: false, altKey: false })

describe('createPressHoldDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('组合键全部按下后，经过 startDelay 触发一次 onStart', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const detector = createPressHoldDetector({ targetKeys: [META, SHIFT, BACKQUOTE], onStart, onStop })

    detector.handleKeyDown(keyDown(META))
    detector.handleKeyDown(keyDown(SHIFT))
    detector.handleKeyDown(keyDown(BACKQUOTE))

    expect(onStart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStop).not.toHaveBeenCalled()
  })

  it('只按下部分键不触发 onStart', () => {
    const onStart = vi.fn()
    const detector = createPressHoldDetector({ targetKeys: [META, SHIFT, BACKQUOTE], onStart, onStop: vi.fn() })

    detector.handleKeyDown(keyDown(META))
    detector.handleKeyDown(keyDown(SHIFT))
    vi.advanceTimersByTime(200)

    expect(onStart).not.toHaveBeenCalled()
  })

  it('按下后仍在 startDelay 内松开则不触发 onStart', () => {
    const onStart = vi.fn()
    const detector = createPressHoldDetector({ targetKeys: [META, SHIFT, BACKQUOTE], onStart, onStop: vi.fn() })

    detector.handleKeyDown(keyDown(META))
    detector.handleKeyDown(keyDown(SHIFT))
    detector.handleKeyDown(keyDown(BACKQUOTE))
    detector.handleKeyUp(keyUp(BACKQUOTE))
    vi.advanceTimersByTime(200)

    expect(onStart).not.toHaveBeenCalled()
  })

  it('录音中松开任一目标键，经过 stopDelay 触发一次 onStop', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const detector = createPressHoldDetector({ targetKeys: [META, SHIFT, BACKQUOTE], onStart, onStop })

    detector.handleKeyDown(keyDown(META))
    detector.handleKeyDown(keyDown(SHIFT))
    detector.handleKeyDown(keyDown(BACKQUOTE))
    vi.advanceTimersByTime(20)
    expect(onStart).toHaveBeenCalledTimes(1)

    detector.handleKeyUp(keyUp(BACKQUOTE))
    expect(onStop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('未录音时松开目标键不触发 onStop', () => {
    const onStop = vi.fn()
    const detector = createPressHoldDetector({ targetKeys: [META, SHIFT, BACKQUOTE], onStart: vi.fn(), onStop })

    detector.handleKeyUp(keyUp(BACKQUOTE))
    vi.advanceTimersByTime(200)

    expect(onStop).not.toHaveBeenCalled()
  })

  it('停止后可再次按下组合键，再次触发 onStart（可重复使用）', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const detector = createPressHoldDetector({ targetKeys: [META, SHIFT, BACKQUOTE], onStart, onStop })

    const pressAll = () => {
      detector.handleKeyDown(keyDown(META))
      detector.handleKeyDown(keyDown(SHIFT))
      detector.handleKeyDown(keyDown(BACKQUOTE))
      vi.advanceTimersByTime(20)
    }
    const releaseOne = () => {
      detector.handleKeyUp(keyUp(BACKQUOTE))
      vi.advanceTimersByTime(50)
    }

    pressAll()
    releaseOne()
    expect(onStop).toHaveBeenCalledTimes(1)

    pressAll()
    expect(onStart).toHaveBeenCalledTimes(2)
  })

  it('dispose 后不再处理任何事件', () => {
    const onStart = vi.fn()
    const detector = createPressHoldDetector({ targetKeys: [META, SHIFT, BACKQUOTE], onStart, onStop: vi.fn() })

    detector.dispose()
    detector.handleKeyDown(keyDown(META))
    detector.handleKeyDown(keyDown(SHIFT))
    detector.handleKeyDown(keyDown(BACKQUOTE))
    vi.advanceTimersByTime(200)

    expect(onStart).not.toHaveBeenCalled()
  })

  it('支持自定义启动/停止防抖时长', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const detector = createPressHoldDetector({
      targetKeys: [META, SHIFT, BACKQUOTE],
      onStart,
      onStop,
      startDelayMs: 100,
      stopDelayMs: 200
    })

    detector.handleKeyDown(keyDown(META))
    detector.handleKeyDown(keyDown(SHIFT))
    detector.handleKeyDown(keyDown(BACKQUOTE))
    vi.advanceTimersByTime(99)
    expect(onStart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onStart).toHaveBeenCalledTimes(1)

    detector.handleKeyUp(keyUp(BACKQUOTE))
    vi.advanceTimersByTime(199)
    expect(onStop).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('长按自动重复不重置启动定时器：首次按下后持续重复仍能按时触发 onStart', () => {
    const onStart = vi.fn()
    const detector = createPressHoldDetector({
      targetKeys: [BACKQUOTE],
      onStart,
      onStop: vi.fn(),
      startDelayMs: 20
    })

    detector.handleKeyDown(keyDown(BACKQUOTE)) // 首次按下，设 20ms 启动定时器
    vi.advanceTimersByTime(10) // 过 10ms（< 20ms，尚未触发）
    // 自动重复：同一键持续抛 keydown。修复前会清掉并重设 20ms 定时器，使总等待重新计时、永不到期
    detector.handleKeyDown(keyDown(BACKQUOTE))
    detector.handleKeyDown(keyDown(BACKQUOTE))
    vi.advanceTimersByTime(10) // 累计 20ms：修复后定时器未被重置，此时触发
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  describe('自身注入的回声按键（修饰键释放/退格）', () => {
    it('被判定为回声的 keyup 不算「松手」：录音不会中途停止', () => {
      const onStart = vi.fn()
      const onStop = vi.fn()
      let isEcho = false
      const detector = createPressHoldDetector({
        targetKeys: [META, BACKQUOTE],
        onStart,
        onStop,
        shouldIgnoreKeyEvent: () => isEcho
      })

      detector.handleKeyDown(keyDown(META))
      detector.handleKeyDown(keyDown(BACKQUOTE))
      vi.advanceTimersByTime(20)
      expect(onStart).toHaveBeenCalledTimes(1)

      isEcho = true
      detector.handleKeyUp(keyUp(BACKQUOTE)) // 我们自己注入的抬起
      vi.advanceTimersByTime(200)
      expect(onStop).not.toHaveBeenCalled()

      isEcho = false
      detector.handleKeyUp(keyUp(BACKQUOTE)) // 主人真实松手
      vi.advanceTimersByTime(50)
      expect(onStop).toHaveBeenCalledTimes(1)
    })

    it('被忽略的 keyup 不改变按住状态：后续自动重复仍算重复、不重设启动定时器', () => {
      const onStart = vi.fn()
      let isEcho = false
      const detector = createPressHoldDetector({
        targetKeys: [BACKQUOTE],
        onStart,
        onStop: vi.fn(),
        startDelayMs: 20,
        shouldIgnoreKeyEvent: () => isEcho
      })

      detector.handleKeyDown(keyDown(BACKQUOTE))
      vi.advanceTimersByTime(5)
      isEcho = true
      detector.handleKeyUp(keyUp(BACKQUOTE)) // 回声：忽略，且不能把键从「按住集合」里删掉
      isEcho = false
      detector.handleKeyDown(keyDown(BACKQUOTE)) // 自动重复
      vi.advanceTimersByTime(15) // 累计 20ms
      expect(onStart).toHaveBeenCalledTimes(1)
    })

    it('未提供 shouldIgnoreKeyEvent 时行为与过去一致', () => {
      const onStart = vi.fn()
      const onStop = vi.fn()
      const detector = createPressHoldDetector({ targetKeys: [BACKQUOTE], onStart, onStop })

      detector.handleKeyDown(keyDown(BACKQUOTE))
      vi.advanceTimersByTime(20)
      detector.handleKeyUp(keyUp(BACKQUOTE))
      vi.advanceTimersByTime(50)
      expect(onStop).toHaveBeenCalledTimes(1)
    })
  })
})