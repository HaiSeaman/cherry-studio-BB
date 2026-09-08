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
  const { targetKeys, onStart, onStop, startDelayMs = 20, stopDelayMs = 50 } = options
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
      pressed.add(e.keycode)
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