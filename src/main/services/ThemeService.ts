import { IpcChannel } from '@shared/IpcChannel'
import { ThemeMode } from '@types'
import { BrowserWindow, nativeTheme } from 'electron'

import { titleBarOverlayDark, titleBarOverlayLight } from '../config'
import { configManager } from './ConfigManager'

/**
 * 主题同步：渲染进程选择主题（themeId → mode）后调用 setTheme，
 * 本服务负责窗口 chrome（标题栏覆盖/原生主题）与渲染进程属性保持一致。
 */
class ThemeService {
  private theme: ThemeMode = ThemeMode.light
  constructor() {
    this.theme = configManager.getTheme()
    if (this.theme !== ThemeMode.dark && this.theme !== ThemeMode.light) {
      // 旧版本兼容：system/其他一律落到浅色（渲染进程 themeId 才是真正来源）
      this.theme = ThemeMode.light
    }
    nativeTheme.themeSource = this.theme
    nativeTheme.on('updated', this.themeUpdatadHandler.bind(this))
  }

  themeUpdatadHandler() {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && !win.isDestroyed() && win.setTitleBarOverlay) {
        try {
          win.setTitleBarOverlay(nativeTheme.shouldUseDarkColors ? titleBarOverlayDark : titleBarOverlayLight)
        } catch (error) {
          // don't throw error if setTitleBarOverlay failed
          // Because it may be called with some windows have some title bar
        }
      }
      win.webContents.send(IpcChannel.ThemeUpdated, nativeTheme.shouldUseDarkColors ? ThemeMode.dark : ThemeMode.light)
    })
  }

  setTheme(theme: ThemeMode) {
    if (theme !== ThemeMode.dark && theme !== ThemeMode.light) {
      return
    }
    if (theme === this.theme) {
      return
    }

    this.theme = theme
    nativeTheme.themeSource = theme
    configManager.setTheme(theme)
  }
}

export const themeService = new ThemeService()
