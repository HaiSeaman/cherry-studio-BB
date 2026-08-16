import { IpcChannel } from '@shared/IpcChannel'
import { ThemeMode } from '@types'
import { BrowserWindow, nativeTheme } from 'electron'

import { titleBarOverlayLight } from '../config'
import { configManager } from './ConfigManager'

/**
 * 晨间绿洲 UI：固定浅色主题。任何主题变更事件都保持 light，
 * 不再向渲染进程发送深色状态。
 */
class ThemeService {
  private theme: ThemeMode = ThemeMode.light
  constructor() {
    this.theme = ThemeMode.light
    nativeTheme.themeSource = ThemeMode.light
    nativeTheme.on('updated', this.themeUpdatadHandler.bind(this))
  }

  themeUpdatadHandler() {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && !win.isDestroyed() && win.setTitleBarOverlay) {
        try {
          win.setTitleBarOverlay(titleBarOverlayLight)
        } catch (error) {
          // don't throw error if setTitleBarOverlay failed
          // Because it may be called with some windows have some title bar
        }
      }
      win.webContents.send(IpcChannel.ThemeUpdated, ThemeMode.light)
    })
  }

  setTheme(theme: ThemeMode) {
    if (theme === this.theme) {
      return
    }

    // 固定浅色：忽略任何传入主题，仅保证 nativeTheme 处于 light
    this.theme = ThemeMode.light
    nativeTheme.themeSource = ThemeMode.light
    configManager.setTheme(ThemeMode.light)
  }
}

export const themeService = new ThemeService()
