import { loggerService } from '@logger'
import { IpcChannel } from '@shared/IpcChannel'
import type { Shortcut } from '@types'

import { windowService } from '../WindowService'
import { createVoiceKeyboardHook, parseShortcutToKeycodes, type VoiceKeyboardHook } from './keyboardHook'
import { voiceInputService } from './VoiceInputService'

const logger = loggerService.withContext('VoiceKeyboard')

/**
 * 语音输入键盘钩子单例管理器。
 * ShortcutService 每次注册/重注册快捷键时把 voice_input 配置 sync 到这里：
 * 启用且有快捷键 → 启动全局钩子；否则停止。
 * 按下/松开 → 向主窗口广播 begin/end 事件（渲染进程据此开/关麦克风）。
 */
class VoiceKeyboardManager {
  private hook: VoiceKeyboardHook | null = null
  /** 当前按住的快捷键键码：交给焦点守卫用于忽略长按自动重复 */
  private holdKeys: number[] = []
  /** 上次 sync 的快捷键：未变则跳过 updateShortcut，避免窗口 focus/blur 反复重连 uiohook 丢事件 */
  private lastShortcut: string[] | null = null

  private readonly onStart = (): void => {
    logger.info('voice input started')
    voiceInputService.start(this.holdKeys)
    windowService.getMainWindow()?.webContents.send(IpcChannel.VoiceInput_BeginCapture)
  }

  private readonly onStop = (): void => {
    logger.info('voice input stopped')
    windowService.getMainWindow()?.webContents.send(IpcChannel.VoiceInput_EndCapture)
  }

  sync(shortcut: Shortcut): void {
    const enabled = shortcut.enabled && shortcut.shortcut.length > 0
    this.holdKeys = parseShortcutToKeycodes(shortcut.shortcut)

    if (!enabled) {
      if (this.hook) {
        this.hook.dispose()
        this.hook = null
      }
      this.lastShortcut = null
      return
    }

    if (!this.hook) {
      this.hook = createVoiceKeyboardHook(shortcut.shortcut, this.onStart, this.onStop)
      this.lastShortcut = [...shortcut.shortcut]
    } else if (!sameShortcut(this.lastShortcut, shortcut.shortcut)) {
      // 仅当快捷键真的变了才重建检测器：ShortcutService 在窗口 focus/blur 时会反复 sync，
      // 无谓地 stop+off+重连 uiohook 会让按住按键时刚好落在断开窗口内丢 keyup（录音不停止）
      this.hook.updateShortcut(shortcut.shortcut)
      this.lastShortcut = [...shortcut.shortcut]
    }

    this.hook.start()
  }

  dispose(): void {
    if (this.hook) {
      this.hook.dispose()
      this.hook = null
    }
    this.lastShortcut = null
  }
}

export const voiceKeyboardManager = new VoiceKeyboardManager()

/** 比较两组快捷键是否相同（顺序敏感，与录入一致） */
function sameShortcut(a: string[] | null, b: string[]): boolean {
  if (!a || a.length !== b.length) return false
  return a.every((k, i) => k === b[i])
}
