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
      return
    }

    if (!this.hook) {
      this.hook = createVoiceKeyboardHook(shortcut.shortcut, this.onStart, this.onStop)
    } else {
      // 快捷键配置变了：更新检测目标（保持当前钩子状态）
      this.hook.updateShortcut(shortcut.shortcut)
    }

    this.hook.start()
  }

  dispose(): void {
    if (this.hook) {
      this.hook.dispose()
      this.hook = null
    }
  }
}

export const voiceKeyboardManager = new VoiceKeyboardManager()
