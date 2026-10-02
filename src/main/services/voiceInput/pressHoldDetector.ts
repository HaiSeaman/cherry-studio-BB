export interface KeyEventLike {
  keycode: number
  metaKey?: boolean
  shiftKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}

export interface PressHoldDetectorOptions {
  /** 目标组合键的 keycode 列表（全部按下才算触发） */
  targetKeys: number[]
  onStart: () => void
  onStop: () => void
  /** 按下防抖毫秒数，默认 20 */
  startDelayMs?: number
  /** 松开防抖毫秒数，默认 50 */
  stopDelayMs?: number
  /**
   * 判断某个键事件是不是「我们自己注入的回声」。返回 true 时整个事件被忽略：
   * 既不改变按住状态，也不触发 start/stop。
   * 必须传事件对象本身（不是键码）：同一个事件会被多个监听器读到，
   * 回声登记表要靠对象身份保证只扣一次计数。
   */
  shouldIgnoreKeyEvent?: (event: KeyEventLike) => boolean
}

export interface PressHoldDetector {
  handleKeyDown(e: KeyEventLike): void
  handleKeyUp(e: KeyEventLike): void
  dispose(): void
}

/**
 * 「按住说话」检测器：维护已按下键集合，当目标组合键全部按下时（防抖后）
 * 触发 onStart；松开组合中任一键时（防抖后）触发 onStop。
 * 与具体键盘库无关，事件以抽象 KeyEventLike 输入，便于单元测试。
 */
export function createPressHoldDetector(options: PressHoldDetectorOptions): PressHoldDetector {
  const { targetKeys, onStart, onStop, startDelayMs = 20, stopDelayMs = 50, shouldIgnoreKeyEvent } = options
  const pressed = new Set<number>()
  let recording = false
  let startTimer: ReturnType<typeof setTimeout> | null = null
  let stopTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const isTargetPressed = (): boolean => targetKeys.every((key) => pressed.has(key))
  const isTargetKey = (keycode: number): boolean => targetKeys.includes(keycode)

  const clearStartTimer = (): void => {
    if (startTimer) {
      clearTimeout(startTimer)
      startTimer = null
    }
  }

  const clearStopTimer = (): void => {
    if (stopTimer) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
  }

  return {
    handleKeyDown(e) {
      if (disposed) return
      // 我们自己注入的回声（修饰键抬起等）：整个事件忽略，按住状态也不动
      if (shouldIgnoreKeyEvent?.(e)) return
      // 长按会持续抛出自动重复的 keydown：忽略它们，否则每次都会清掉并重设启动定时器，
      // 在重复延迟极短的键盘上可能让 onStart 永不触发（与 focusGuard 的 isRepeat 处理一致）
      const isRepeat = pressed.has(e.keycode)
      pressed.add(e.keycode)
      if (isRepeat) return
      if (!recording && isTargetPressed()) {
        clearStartTimer()
        startTimer = setTimeout(() => {
          startTimer = null
          // 回调时再确认一次组合键仍全部按住（防御快速松开竞态）
          if (isTargetPressed()) {
            recording = true
            onStart()
          }
        }, startDelayMs)
      }
    },

    handleKeyUp(e) {
      if (disposed) return
      // 回声抬起不能算「主人松手」，否则录音会被自己的注入打断；
      // 也不能把键从按住集合里删掉，否则后续的自动重复会被当成新的一次输入
      if (shouldIgnoreKeyEvent?.(e)) return
      pressed.delete(e.keycode)
      if (recording) {
        if (isTargetKey(e.keycode)) {
          clearStopTimer()
          stopTimer = setTimeout(() => {
            stopTimer = null
            recording = false
            onStop()
          }, stopDelayMs)
        }
      } else {
        // 未开始录音时松开目标键 → 取消待触发的 start
        if (isTargetKey(e.keycode)) {
          clearStartTimer()
        }
      }
    },

    dispose() {
      disposed = true
      clearStartTimer()
      clearStopTimer()
    }
  }
}