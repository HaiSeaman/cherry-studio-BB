// just import the themeService to ensure the theme is initialized
import './ThemeService'

import { is } from '@electron-toolkit/utils'
import { loggerService } from '@logger'
import { isDev, isLinux, isMac, isWin } from '@main/constant'
import { getFilesDir } from '@main/utils/file'
import { getWindowsBackgroundMaterial } from '@main/utils/windowUtil'
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from '@shared/config/constant'
import { IpcChannel } from '@shared/IpcChannel'
import { app, BrowserWindow, nativeImage, screen, shell } from 'electron'
import windowStateKeeper from 'electron-window-state'
import path, { join } from 'path'

import iconPath from '../../../build/icon.png?asset'
import { titleBarOverlayDark, titleBarOverlayLight } from '../config'
import { configManager } from './ConfigManager'
import { contextMenu } from './ContextMenu'
import { isSafeExternalUrl } from './security'
import { initSessionUserAgent } from './WebviewService'

const DEFAULT_MINIWINDOW_WIDTH = 550
const DEFAULT_MINIWINDOW_HEIGHT = 400

/** 桌面挂件窗口配置（便签/音乐挂件共用同一控制器） */
type WidgetWindowConfig = {
  /** electron-window-state 持久化文件名 */
  stateFile: string
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
  /** 渲染入口 HTML 文件名（dev 时拼 ELECTRON_RENDERER_URL，prod 时 loadFile） */
  htmlFile: string
  /** webContents 安全处理（导航拦截等，复用 WindowService 的现有逻辑） */
  setupWebContents: (win: BrowserWindow) => void
}

/**
 * 桌面挂件窗口控制器：懒创建 / 位置记忆 / 置顶 / 锁定 / 拖拽与拉伸（原生能力）。
 * 设计约束（与 miniWindow 的差异）：
 * - 不注册 blur 自动隐藏，不参与"主窗口显示时隐藏迷你窗口"——挂件是桌面常驻伴侣
 * - 关闭 = destroy 完全释放内存（数据在 Dexie/主窗口，无损失）
 * - 已移除贴边吸附/折叠功能（离屏 setPosition 在多显示器下易产生 NaN 导致主进程崩溃，
 *   且交互复杂，按需求回归"固定/置顶/拖拽/缩放"即可）
 */
class WidgetWindowController {
  private win: BrowserWindow | null = null

  constructor(private cfg: WidgetWindowConfig) {}

  get(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null
  }

  /** 是否已通过懒创建生成过窗口（首次点击后置位，用于幂等 show） */
  private shown = false

  show(): void {
    const win = this.get()
    if (win) {
      // 已存在：若界面已在加载（未 ready-to-show），交给其内部回调 show，避免提前显示白窗闪烁
      if (!win.isVisible() && this.shown) {
        win.show()
      }
      return
    }
    this.shown = true
    this.create()
  }

  /** 可见则隐藏，否则显示/懒创建（侧边栏按钮、托盘、设置开关共用） */
  toggle(): void {
    const win = this.get()
    if (win && win.isVisible()) {
      win.hide()
      return
    }
    this.show()
  }

  /** 销毁窗口并完全释放内存 */
  close(): void {
    this.get()?.destroy()
  }

  setPin(pinned: boolean): void {
    this.get()?.setAlwaysOnTop(pinned, 'screen-saver')
  }

  setLock(locked: boolean): void {
    this.get()?.setResizable(!locked)
  }

  private create(): BrowserWindow {
    const state = windowStateKeeper({
      defaultWidth: this.cfg.defaultWidth,
      defaultHeight: this.cfg.defaultHeight,
      file: this.cfg.stateFile
    })

    this.win = new BrowserWindow({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      minWidth: this.cfg.minWidth,
      minHeight: this.cfg.minHeight,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      alwaysOnTop: true,
      useContentSize: true,
      skipTaskbar: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        // 与 miniWindow 一致：file:// 下确保 IndexedDB（Dexie）可靠可用
        webSecurity: false
      }
    })

    this.cfg.setupWebContents(this.win)
    state.manage(this.win)
    this.win.setAlwaysOnTop(true, 'screen-saver')
    // 挂件应常驻所有工作区并覆盖全屏应用/游戏，与 miniWindow 一致
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    this.win.on('ready-to-show', () => {
      this.win?.show()
      // 通知主窗口渲染层重推当前主题 token，让新建的挂件跟随主程序配色
      windowService.getMainWindow()?.webContents.send(IpcChannel.Theme_RequestPush)
    })
    this.win.on('closed', () => {
      this.win = null
      this.shown = false
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void this.win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/' + this.cfg.htmlFile)
    } else {
      void this.win.loadFile(join(__dirname, '../renderer/', this.cfg.htmlFile))
    }

    return this.win
  }
}

// const logger = loggerService.withContext('WindowService')
const logger = loggerService.withContext('WindowService')

// Create nativeImage for Linux window icon (required for Wayland)
const linuxIcon = isLinux ? nativeImage.createFromPath(iconPath) : undefined

export class WindowService {
  private mainWindow: BrowserWindow | null = null
  private miniWindow: BrowserWindow | null = null
  private isPinnedMiniWindow: boolean = false
  //hacky-fix: store the focused status of mainWindow before miniWindow shows
  //to restore the focus status when miniWindow hides
  private wasMainWindowFocused: boolean = false
  private lastRendererProcessCrashTime: number = 0

  public createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show()
      this.mainWindow.focus()
      return this.mainWindow
    }

    const mainWindowState = windowStateKeeper({
      defaultWidth: MIN_WINDOW_WIDTH,
      defaultHeight: MIN_WINDOW_HEIGHT,
      fullScreen: false,
      maximize: false
    })
    const windowsBackgroundMaterial = getWindowsBackgroundMaterial()
    // 窗口 chrome 跟随当前主题模式（渲染进程 themeId 决定 light/dark）
    const isDarkTheme = configManager.getTheme() === 'dark'
    // Mica 材质时由系统填充背景，无需显式背景色
    const mainWindowBackgroundColor =
      isMac || windowsBackgroundMaterial ? undefined : isDarkTheme ? '#23262B' : '#F5F9F6'

    this.mainWindow = new BrowserWindow({
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      autoHideMenuBar: true,
      transparent: false,
      // vibrancy / visualEffectState are macOS-only. Passing them on Windows
      // (Electron 41 + Windows 10) was linked to intermittent renderer crashes.
      ...(isMac
        ? {
            vibrancy: 'sidebar' as const,
            visualEffectState: 'active' as const
          }
        : {}),
      // For Windows and Linux, we use frameless window with custom controls
      // For Mac, we keep the native title bar style
      ...(isMac
        ? {
            titleBarStyle: 'hidden',
            titleBarOverlay: isDarkTheme ? titleBarOverlayDark : titleBarOverlayLight,
            trafficLightPosition: { x: 13, y: 13 }
          }
        : {
            // On Linux, allow using system title bar if setting is enabled
            frame: isLinux && configManager.getUseSystemTitleBar() ? true : false
          }),
      ...(windowsBackgroundMaterial ? { backgroundMaterial: windowsBackgroundMaterial } : {}),
      ...(mainWindowBackgroundColor ? { backgroundColor: mainWindowBackgroundColor } : {}),
      darkTheme: isDarkTheme,
      ...(isLinux ? { icon: linuxIcon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webSecurity: false,
        webviewTag: true,
        allowRunningInsecureContent: true,
        zoomFactor: configManager.getZoomFactor()
      }
    })

    this.setupMainWindow(this.mainWindow, mainWindowState)

    // 迷你窗口改为懒创建（showMiniWindow 首次调用时再建）：
    // 预加载原本只为解决 macOS 的窗口问题，在 Windows 上白烧一个常驻渲染进程（~180MB）
    // init the MinApp webviews' useragent
    initSessionUserAgent()

    return this.mainWindow
  }

  private setupMainWindow(mainWindow: BrowserWindow, mainWindowState: any) {
    mainWindowState.manage(mainWindow)

    this.setupMaximize(mainWindow, mainWindowState.isMaximized)
    this.setupContextMenu(mainWindow)
    this.setupSpellCheck(mainWindow)
    this.setupWindowEvents(mainWindow)
    this.setupWebContentsHandlers(mainWindow)
    this.setupWindowLifecycleEvents(mainWindow)
    this.setupMainWindowMonitor(mainWindow)
    this.loadMainWindowContent(mainWindow)
  }

  private setupSpellCheck(mainWindow: BrowserWindow) {
    const enableSpellCheck = configManager.get('enableSpellCheck', false)
    if (enableSpellCheck) {
      try {
        const spellCheckLanguages = configManager.get('spellCheckLanguages', []) as string[]
        spellCheckLanguages.length > 0 && mainWindow.webContents.session.setSpellCheckerLanguages(spellCheckLanguages)
      } catch (error) {
        logger.error('Failed to set spell check languages:', error as Error)
      }
    }
  }

  private setupMainWindowMonitor(mainWindow: BrowserWindow) {
    mainWindow.webContents.on('render-process-gone', (_, details) => {
      logger.error(`Renderer process crashed with: ${JSON.stringify(details)}`)
      const currentTime = Date.now()
      const lastCrashTime = this.lastRendererProcessCrashTime
      this.lastRendererProcessCrashTime = currentTime
      if (currentTime - lastCrashTime > 60 * 1000) {
        // 如果大于1分钟，则重启渲染进程
        mainWindow.webContents.reload()
      } else {
        // 如果小于1分钟，则退出应用, 可能是连续crash，需要退出应用
        app.exit(1)
      }
    })
  }

  private setupMaximize(mainWindow: BrowserWindow, isMaximized: boolean) {
    if (isMaximized) {
      // 如果是从托盘启动，则需要延迟最大化，否则显示的就不是重启前的最大化窗口了
      configManager.getLaunchToTray()
        ? mainWindow.once('show', () => {
            mainWindow.maximize()
          })
        : mainWindow.maximize()
    }
  }

  private setupContextMenu(mainWindow: BrowserWindow) {
    contextMenu.contextMenu(mainWindow.webContents)
    // setup context menu for all webviews like miniapp（去重：窗口重建时避免重复注册累积）
    app.removeListener('web-contents-created', this.onWebContentsCreated)
    app.on('web-contents-created', this.onWebContentsCreated)
    // 注意：不要向远程 webview（chatgpt.com 等不可信内容）注入 preload——
    // 完整 preload 会暴露 window.api 任意文件读写与 IPC 通道。小程序不依赖注入的 preload。
  }

  private onWebContentsCreated = (_event: Electron.Event, webContents: Electron.WebContents) => {
    contextMenu.contextMenu(webContents)
  }

  private setupWindowEvents(mainWindow: BrowserWindow) {
    mainWindow.once('ready-to-show', () => {
      mainWindow.webContents.setZoomFactor(configManager.getZoomFactor())

      // show window only when laucn to tray not set
      const isLaunchToTray = configManager.getLaunchToTray()
      if (!isLaunchToTray) {
        //[mac]hacky-fix: miniWindow set visibleOnFullScreen:true will cause dock icon disappeared
        void app.dock?.show()
        mainWindow.show()
      }
    })

    // 处理全屏相关事件
    mainWindow.on('enter-full-screen', () => {
      mainWindow.webContents.send(IpcChannel.FullscreenStatusChanged, true)
    })

    mainWindow.on('leave-full-screen', () => {
      mainWindow.webContents.send(IpcChannel.FullscreenStatusChanged, false)
    })

    // set the zoom factor again when the window is going to resize
    //
    // this is a workaround for the known bug that
    // the zoom factor is reset to cached value when window is resized after routing to other page
    // see: https://github.com/electron/electron/issues/10572
    //
    // and resize ipc
    //
    mainWindow.on('will-resize', () => {
      mainWindow.webContents.setZoomFactor(configManager.getZoomFactor())
    })

    // set the zoom factor again when the window is going to restore
    // minimize and restore will cause zoom reset
    mainWindow.on('restore', () => {
      mainWindow.webContents.setZoomFactor(configManager.getZoomFactor())
    })

    // ARCH: as `will-resize` is only for Win & Mac,
    // linux has the same problem, use `resize` listener instead
    // but `resize` will fliker the ui
    if (isLinux) {
      mainWindow.on('resize', () => {
        mainWindow.webContents.setZoomFactor(configManager.getZoomFactor())
      })
    }
  }

  private setupWebContentsHandlers(mainWindow: BrowserWindow) {
    // Fix for Electron bug where zoom resets during in-page navigation (route changes)
    // This complements the resize-based workaround by catching navigation events
    mainWindow.webContents.on('did-navigate-in-page', () => {
      mainWindow.webContents.setZoomFactor(configManager.getZoomFactor())
    })

    mainWindow.webContents.on('will-navigate', (event, url) => {
      // Dev-only: allow the Vite dev server URL
      if (isDev && url.includes('localhost:517')) {
        return
      }

      event.preventDefault()
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url)
      } else {
        logger.warn(`Blocked navigation to untrusted URL scheme: ${url}`)
      }
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
      const { url } = details

      const oauthProviderUrls = [
        'https://account.siliconflow.cn/oauth',
        'https://cloud.siliconflow.cn/bills',
        'https://cloud.siliconflow.cn/expensebill',
        'https://console.inferera.com/token',
        'https://console.inferera.com/topup',
        'https://console.inferera.com/statistics',
        'https://dash.302.ai/sso/login',
        'https://dash.302.ai/charge',
        'https://maas.aiionly.com/login'
      ]

      if (oauthProviderUrls.some((link) => url.startsWith(link))) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            webPreferences: {
              partition: 'persist:webview'
            }
          }
        }
      }

      if (url.includes('http://file/')) {
        const fileName = url.replace('http://file/', '')
        if (!fileName) {
          logger.warn('Blocked empty file name in http://file/ URL')
          return { action: 'deny' }
        }
        const storageDir = getFilesDir()
        const filePath = path.resolve(storageDir, fileName)
        // Prevent path traversal: ensure resolved path is within storageDir
        if (!filePath.startsWith(path.resolve(storageDir) + path.sep)) {
          logger.warn(`Blocked path traversal attempt: ${fileName}`)
        } else {
          shell.openPath(filePath).catch((err) => logger.error('Failed to open file:', err))
        }
      } else if (isSafeExternalUrl(details.url)) {
        void shell.openExternal(details.url)
      } else {
        logger.warn(`Blocked shell.openExternal for untrusted URL scheme: ${details.url}`)
      }

      return { action: 'deny' }
    })
  }

  private loadMainWindowContent(mainWindow: BrowserWindow) {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public getMiniWindow(): BrowserWindow | null {
    return this.miniWindow && !this.miniWindow.isDestroyed() ? this.miniWindow : null
  }

  private setupWindowLifecycleEvents(mainWindow: BrowserWindow) {
    mainWindow.on('close', (event) => {
      // save data before when close window
      try {
        mainWindow.webContents.send(IpcChannel.App_SaveData)
      } catch (error) {
        logger.error('Failed to save data:', error as Error)
      }

      // 如果已经触发退出，直接退出
      if (app.isQuitting) {
        return app.quit()
      }

      // 托盘及关闭行为设置
      const isShowTray = configManager.getTray()
      const isTrayOnClose = configManager.getTrayOnClose()

      // 没有开启托盘，或者开启了托盘，但设置了直接关闭，应执行直接退出
      if (!isShowTray || (isShowTray && !isTrayOnClose)) {
        // 如果是Windows或Linux，直接退出
        // mac按照系统默认行为，不退出
        if (isWin || isLinux) {
          return app.quit()
        }
      }

      /**
       * 上述逻辑以下:
       * win/linux: 是"开启托盘+设置关闭时最小化到托盘"的情况
       * mac: 任何情况都会到这里，因此需要单独处理mac
       */

      if (!mainWindow.isFullScreen()) {
        event.preventDefault()
      }

      mainWindow.hide()

      //for mac users, should hide dock icon if close to tray
      if (isMac && isTrayOnClose) {
        app.dock?.hide()

        mainWindow.once('show', () => {
          //restore the window can hide by cmd+h when the window is shown again
          // https://github.com/electron/electron/pull/47970
          void app.dock?.show()
        })
      }
    })

    mainWindow.on('closed', () => {
      this.mainWindow = null
    })

    mainWindow.on('show', () => {
      if (this.miniWindow && !this.miniWindow.isDestroyed()) {
        this.miniWindow.hide()
      }
    })
  }

  public showMainWindow() {
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.miniWindow.hide()
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
        return
      }

      /**
       * [Linux] Special handling for window activation
       * When the window is visible but covered by other windows, simply calling show() and focus()
       * is not enough to bring it to the front. We need to hide it first, then show it again.
       * This mimics the "close to tray and reopen" behavior which works correctly.
       */
      if (isLinux && this.mainWindow.isVisible() && !this.mainWindow.isFocused()) {
        this.mainWindow.hide()
        setImmediate(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.show()
            this.mainWindow.focus()
          }
        })
        return
      }

      /**
       * About setVisibleOnAllWorkspaces
       *
       * [macOS] Known Issue
       *  setVisibleOnAllWorkspaces true/false will NOT bring window to current desktop in Mac (works fine with Windows)
       *  AppleScript may be a solution, but it's not worth
       *
       * [Linux] Known Issue
       *  setVisibleOnAllWorkspaces 在 Linux 环境下（特别是 KDE Wayland）会导致窗口进入"假弹出"状态
       *  因此在 Linux 环境下不执行这两行代码
       */
      if (!isLinux) {
        this.mainWindow.setVisibleOnAllWorkspaces(true)
      }

      /**
       * [macOS] After being closed in fullscreen, the fullscreen behavior will become strange when window shows again
       * So we need to set it to FALSE explicitly.
       * althougle other platforms don't have the issue, but it's a good practice to do so
       *
       *  Check if window is visible to prevent interrupting fullscreen state when clicking dock icon
       */
      if (this.mainWindow.isFullScreen() && !this.mainWindow.isVisible()) {
        this.mainWindow.setFullScreen(false)
      }

      this.mainWindow.show()
      this.mainWindow.focus()
      if (!isLinux) {
        this.mainWindow.setVisibleOnAllWorkspaces(false)
      }
    } else {
      this.mainWindow = this.createMainWindow()
    }
  }

  public toggleMainWindow() {
    // should not toggle main window when in full screen
    // but if the main window is close to tray when it's in full screen, we can show it again
    // (it's a bug in macos, because we can close the window when it's in full screen, and the state will be remained)
    if (this.mainWindow?.isFullScreen() && this.mainWindow?.isVisible()) {
      return
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
      if (this.mainWindow.isFocused()) {
        // if tray is enabled, hide the main window, else do nothing
        if (configManager.getTray()) {
          this.mainWindow.hide()
          app.dock?.hide()
        }
      } else {
        this.mainWindow.focus()
      }
      return
    }

    this.showMainWindow()
  }

  public createMiniWindow(isPreload: boolean = false): BrowserWindow {
    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      return this.miniWindow
    }

    const miniWindowState = windowStateKeeper({
      defaultWidth: DEFAULT_MINIWINDOW_WIDTH,
      defaultHeight: DEFAULT_MINIWINDOW_HEIGHT,
      file: 'miniWindow-state.json'
    })

    this.miniWindow = new BrowserWindow({
      x: miniWindowState.x,
      y: miniWindowState.y,
      width: miniWindowState.width,
      height: miniWindowState.height,
      minWidth: 350,
      minHeight: 380,
      maxWidth: 1024,
      maxHeight: 768,
      show: false,
      autoHideMenuBar: true,
      transparent: isMac,
      vibrancy: 'under-window',
      visualEffectState: 'followWindow',
      frame: false,
      alwaysOnTop: true,
      useContentSize: true,
      ...(isMac ? { type: 'panel' } : {}),
      skipTaskbar: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webSecurity: false,
        webviewTag: true
      }
    })

    this.setupWebContentsHandlers(this.miniWindow)

    miniWindowState.manage(this.miniWindow)

    //miniWindow should show in current desktop
    this.miniWindow?.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    })
    //make miniWindow always on top of fullscreen apps with level set
    //[mac] level higher than 'floating' will cover the pinyin input method
    this.miniWindow.setAlwaysOnTop(true, 'floating')

    this.miniWindow.on('ready-to-show', () => {
      if (isPreload) {
        return
      }

      this.wasMainWindowFocused = this.mainWindow?.isFocused() || false
      this.miniWindow?.center()
      this.miniWindow?.show()
    })

    this.miniWindow.on('blur', () => {
      if (!this.isPinnedMiniWindow) {
        this.hideMiniWindow()
      }
    })

    this.miniWindow.on('closed', () => {
      this.miniWindow = null
    })

    this.miniWindow.on('show', () => {
      this.miniWindow?.webContents.send(IpcChannel.ShowMiniWindow)
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      void this.miniWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/miniWindow.html')
    } else {
      void this.miniWindow.loadFile(join(__dirname, '../renderer/miniWindow.html'))
    }

    return this.miniWindow
  }

  public showMiniWindow() {
    const enableQuickAssistant = configManager.getEnableQuickAssistant()

    if (!enableQuickAssistant) {
      return
    }

    if (this.miniWindow && !this.miniWindow.isDestroyed()) {
      this.wasMainWindowFocused = this.mainWindow?.isFocused() || false

      // [Windows] hacky fix
      // the window is minimized only when in Windows platform
      // because it's a workaround for Windows, see `hideMiniWindow()`
      if (this.miniWindow?.isMinimized()) {
        // don't let the window being seen before we finish adjusting the position across screens
        this.miniWindow?.setOpacity(0)
        // DO NOT use `restore()` here, Electron has the bug with screens of different scale factor
        // We have to use `show()` here, then set the position and bounds
        this.miniWindow?.show()
      }

      const miniWindowBounds = this.miniWindow.getBounds()

      // Check if miniWindow is on the same screen as mouse cursor
      const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      const miniWindowDisplay = screen.getDisplayNearestPoint(miniWindowBounds)

      // Show the miniWindow on the cursor's screen center
      // If miniWindow is not on the same screen as cursor, move it to cursor's screen center
      if (cursorDisplay.id !== miniWindowDisplay.id) {
        const workArea = cursorDisplay.bounds

        // use current window size to avoid the bug of Electron with screens of different scale factor
        const currentBounds = this.miniWindow.getBounds()
        const miniWindowWidth = currentBounds.width
        const miniWindowHeight = currentBounds.height

        // move to the center of the cursor's screen
        const miniWindowX = Math.round(workArea.x + (workArea.width - miniWindowWidth) / 2)
        const miniWindowY = Math.round(workArea.y + (workArea.height - miniWindowHeight) / 2)

        this.miniWindow.setPosition(miniWindowX, miniWindowY, false)
        this.miniWindow.setBounds({
          x: miniWindowX,
          y: miniWindowY,
          width: miniWindowWidth,
          height: miniWindowHeight
        })
      }

      this.miniWindow?.setOpacity(1)
      this.miniWindow?.show()

      return
    }

    // 懒创建：createMiniWindow 内部已在 ready-to-show 时 center+show，
    // 避免页面未加载完就 show() 导致白屏闪烁
    this.miniWindow = this.createMiniWindow()
  }

  public hideMiniWindow() {
    if (!this.miniWindow || this.miniWindow.isDestroyed()) {
      return
    }

    //[macOs/Windows] hacky fix
    // previous window(not self-app) should be focused again after miniWindow hide
    // this workaround is to make previous window focused again after miniWindow hide
    if (isWin) {
      this.miniWindow.setOpacity(0) // don't show the minimizing animation
      this.miniWindow.minimize()
      return
    } else if (isMac) {
      this.miniWindow.hide()
      const majorVersion = parseInt(process.getSystemVersion().split('.')[0], 10)
      if (majorVersion >= 26) {
        // on macOS 26+, the popup of the mimiWindow would not change the focus to previous application.
        return
      }
      if (!this.wasMainWindowFocused) {
        app.hide()
      }
      return
    }

    this.miniWindow.hide()
  }

  public closeMiniWindow() {
    this.miniWindow?.close()
  }

  public toggleMiniWindow() {
    if (this.miniWindow && !this.miniWindow.isDestroyed() && this.miniWindow.isVisible()) {
      this.hideMiniWindow()
      return
    }

    this.showMiniWindow()
  }

  public setPinMiniWindow(isPinned) {
    this.isPinnedMiniWindow = isPinned
  }

  // ---------------- 桌面挂件（Sticky / Music Widget） ----------------
  private stickyWidget = new WidgetWindowController({
    stateFile: 'sticky-widget-state.json',
    defaultWidth: 320,
    defaultHeight: 480,
    minWidth: 260,
    minHeight: 320,
    htmlFile: 'stickyWidget.html',
    setupWebContents: (win) => this.setupWebContentsHandlers(win)
  })

  private musicWidget = new WidgetWindowController({
    stateFile: 'music-widget-state.json',
    defaultWidth: 380,
    defaultHeight: 220,
    minWidth: 280,
    minHeight: 120,
    htmlFile: 'musicWidget.html',
    setupWebContents: (win) => this.setupWebContentsHandlers(win)
  })

  public getStickyWidget(): BrowserWindow | null {
    return this.stickyWidget.get()
  }

  public showStickyWidget(): void {
    this.stickyWidget.show()
  }

  public toggleStickyWidget(): void {
    this.stickyWidget.toggle()
  }

  public closeStickyWidget(): void {
    this.stickyWidget.close()
  }

  public setStickyWidgetPin(pinned: boolean): void {
    this.stickyWidget.setPin(pinned)
  }

  public setStickyWidgetLock(locked: boolean): void {
    this.stickyWidget.setLock(locked)
  }

  public getMusicWidget(): BrowserWindow | null {
    return this.musicWidget.get()
  }

  public showMusicWidget(): void {
    this.musicWidget.show()
  }

  public toggleMusicWidget(): void {
    this.musicWidget.toggle()
  }

  public closeMusicWidget(): void {
    this.musicWidget.close()
  }

  public setMusicWidgetPin(pinned: boolean): void {
    this.musicWidget.setPin(pinned)
  }

  public setMusicWidgetLock(locked: boolean): void {
    this.musicWidget.setLock(locked)
  }

  /**
   * 引用文本到主窗口
   * @param text 原始文本（未格式化）
   */
  public quoteToMainWindow(text: string): void {
    try {
      this.showMainWindow()

      const mainWindow = this.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          mainWindow.webContents.send(IpcChannel.App_QuoteToMain, text)
        }, 100)
      }
    } catch (error) {
      logger.error('Failed to quote to main window:', error as Error)
    }
  }
}

export const windowService = new WindowService()
