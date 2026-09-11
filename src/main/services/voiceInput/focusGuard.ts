import { uIOhook, type UiohookKeyboardEvent } from 'uiohook-napi'

import { getLastInjectionAt } from './textInserter'

/** 注入回声抑制窗口（毫秒）：紧跟在我们自己注入之后的键鼠事件视为回声，不算用户输入 */
export const INJECTION_ECHO_MS = 120

/**
 * 判断一次键鼠事件是否应视为「用户真实输入」。
 * 我们自己用 SendInput 注入的字符/退格同样会经过系统键盘钩子，
 * 靠「距最近一次注入的时间」把它们排除掉。
 */
export function isUserInputEvent(now: number, lastInjectionAt: number): boolean {
  return now - lastInjectionAt > INJECTION_ECHO_MS
}

export interface FocusGuard {
  /** 开始监听；holdKeys 为当前按住的快捷键键码（长按自动重复不算用户输入） */
  start: (holdKeys: number[]) => void
  stop: () => void
}

/**
 * 焦点漂移守卫：录音期间监听全局键鼠。
 * 用户真的按键或点击（焦点可能已经离开原输入框）时回调，
 * 调用方据此冻结退格修正——宁可少改几个字，也不能把别处的内容删掉。
 */
export function createFocusGuard(onUserInput: () => void): FocusGuard {
  const pressed = new Set<number>()
  let started = false

  const handleKeyDown = (event: UiohookKeyboardEvent): void => {
    // 长按的快捷键会持续抛出 keydown（自动重复），不是用户新的一次输入
    const isRepeat = pressed.has(event.keycode)
    pressed.add(event.keycode)
    if (isRepeat) return
    if (isUserInputEvent(Date.now(), getLastInjectionAt())) onUserInput()
  }

  const handleKeyUp = (event: UiohookKeyboardEvent): void => {
    pressed.delete(event.keycode)
  }

  const handleMouseDown = (): void => {
    if (isUserInputEvent(Date.now(), getLastInjectionAt())) onUserInput()
  }

  return {
    start(holdKeys) {
      if (started) return
      pressed.clear()
      for (const key of holdKeys) pressed.add(key)
      uIOhook.on('keydown', handleKeyDown)
      uIOhook.on('keyup', handleKeyUp)
      uIOhook.on('mousedown', handleMouseDown)
      started = true
    },

    stop() {
      if (!started) return
      uIOhook.off('keydown', handleKeyDown)
      uIOhook.off('keyup', handleKeyUp)
      uIOhook.off('mousedown', handleMouseDown)
      pressed.clear()
      started = false
    }
  }
}
