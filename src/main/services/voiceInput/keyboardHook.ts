import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from 'uiohook-napi'

import { createPressHoldDetector } from './pressHoldDetector'

/**
 * 项目快捷键表键名 → uiohook keycode。
 * Meta 即 Windows 键（设置页录入/显示为 Win），反引号为 '`'（与 desktop_widget 一致）。
 */
const KEYCODE_MAP: Record<string, number> = {
  Meta: UiohookKey.Meta,
  Shift: UiohookKey.Shift,
  Ctrl: UiohookKey.Ctrl,
  Alt: UiohookKey.Alt,
  '`': UiohookKey.Backquote
}

export function parseShortcutToKeycodes(shortcut: string[]): number[] {
  return shortcut.map((key) => KEYCODE_MAP[key]).filter((code): code is number => code !== undefined)
}

export interface VoiceKeyboardHook {
  start: () => void
  stop: () => void
  dispose: () => void
  updateShortcut: (shortcut: string[]) => void
}

/** 键盘钩子薄壳：把 uiohook 的全局 keydown/keyup 喂给 pressHoldDetector，输出 start/stop */
export function createVoiceKeyboardHook(shortcut: string[], onStart: () => void, onStop: () => void): VoiceKeyboardHook {
  let detector = createPressHoldDetector({ targetKeys: parseShortcutToKeycodes(shortcut), onStart, onStop })
  let started = false

  const keydown = (e: UiohookKeyboardEvent): void => detector.handleKeyDown(e)
  const keyup = (e: UiohookKeyboardEvent): void => detector.handleKeyUp(e)

  const hook: VoiceKeyboardHook = {
    start() {
      if (started) return
      uIOhook.on('keydown', keydown)
      uIOhook.on('keyup', keyup)
      uIOhook.start()
      started = true
    },

    stop() {
      if (!started) return
      uIOhook.off('keydown', keydown)
      uIOhook.off('keyup', keyup)
      uIOhook.stop()
      started = false
    },

    dispose() {
      hook.stop()
      detector.dispose()
    },

    updateShortcut(next: string[]) {
      const wasStarted = started
      hook.stop()
      detector.dispose()
      detector = createPressHoldDetector({ targetKeys: parseShortcutToKeycodes(next), onStart, onStop })
      if (wasStarted) hook.start()
    }
  }

  return hook
}

export type { UiohookKeyboardEvent }