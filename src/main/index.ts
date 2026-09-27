// don't reorder this file, it's used to initialize the app data dir and
// other which should be run before the main process is ready
// eslint-disable-next-line
import './bootstrap'

import '@main/config'

import { loggerService } from '@logger'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { replaceDevtoolsFont } from '@main/utils/windowUtil'
import { app, session } from 'electron'
import installExtension, { REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS } from 'electron-devtools-installer'
import { isDev, isLinux, isWin } from './constant'

import process from 'node:process'

import { registerIpc } from './ipc'
import { appMenuService } from './services/AppMenuService'
import { configManager } from './services/ConfigManager'
import mcpService from './services/MCPService'
import powerMonitorService from './services/PowerMonitorService'
import automationService from './services/AutomationService'
import {
  CHERRY_STUDIO_PROTOCOL,
  handleProtocolUrl,
  registerProtocolClient,
  setupAppImageDeepLink
} from './services/ProtocolClient'
import selectionService, { initSelectionService } from './services/SelectionService'
import screenshotService, { initScreenshotService } from './services/ScreenshotService'
import { registerShortcuts } from './services/ShortcutService'
import { TrayService } from './services/TrayService'
import { versionService } from './services/VersionService'
import { windowService } from './services/WindowService'
import { clipboardService } from './services/ClipboardService'
import { initWebviewHotkeys } from './services/WebviewService'
import { extractRtkBinaries } from './utils/rtk'

const logger = loggerService.withContext('MainEntry')

/**
 * Disable hardware acceleration if setting is enabled
 */
const disableHardwareAcceleration = configManager.getDisableHardwareAcceleration()
if (disableHardwareAcceleration) {
  app.disableHardwareAcceleration()
}

/**
 * Disable chromium's window animations
 * main purpose for this is to avoid the transparent window flashing when it is shown
 * (especially on Windows for SelectionAssistant Toolbar)
 * Know Issue: https://github.com/electron/electron/issues/12130#issuecomment-627198990
 */
if (isWin) {
  app.commandLine.appendSwitch('wm-window-animations-disabled')
}

/**
 * Enable GlobalShortcutsPortal for Linux Wayland Protocol
 * see: https://www.electronjs.org/docs/latest/api/global-shortcut
 */
if (isLinux && process.env.XDG_SESSION_TYPE === 'wayland') {
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
}

/**
 * Set window class and name for Linux
 * This ensures the window manager identifies the app correctly on both X11 and Wayland
 */
if (isLinux) {
  app.commandLine.appendSwitch('class', 'Cherry-Studio-BB')
  app.commandLine.appendSwitch('name', 'Cherry-Studio-BB')
}

// DocumentPolicyIncludeJSCallStacksInCrashReports: Include JS call stacks in crash
// reports for unresponsive renderer diagnostics.
// NOTE: EarlyEstablishGpuChannel / EstablishGpuChannelAsync were removed — they
// raced the GPU channel on older Windows 10 builds (19044) and caused
// intermittent renderer-process crashes (exit code 143) at startup.
app.commandLine.appendSwitch('enable-features', 'DocumentPolicyIncludeJSCallStacksInCrashReports')

// onHeadersReceived 是 per-session 的：按 session 只注册一次，避免每个新 webContents 重复注册导致 handler 无限累积
const documentPolicySessions = new WeakSet<Electron.Session>()

// H1：webview 挂载前强制剥离危险 webPreferences。
// 注意 `will-attach-webview` 是「宿主 webContents」的事件（不是 app 事件），
// 故在 web-contents-created 里为每个宿主窗口挂上监听。
// 主窗口开启了 webviewTag + webSecurity:false，若不加管制，被加载的远端页面
// 可通过 <webview preload/nodeintegration> 取得 Node 能力。
// 小程序需要加载任意远端站点，故这里只剥离危险项并放行加载（不做 URL 阻断，避免误伤）。
const sanitizeWebviewPreferences = (
  _event: Electron.Event,
  webPreferences: Electron.WebPreferences,
  params: Record<string, string>
): void => {
  // 删除自定义 preload（本项目 webview 不使用 preload，桥接走 postMessage）
  delete webPreferences.preload
  delete (webPreferences as { preloadURL?: string }).preloadURL
  webPreferences.nodeIntegration = false
  webPreferences.nodeIntegrationInSubFrames = false
  webPreferences.contextIsolation = true
  webPreferences.sandbox = true
  logger.debug('will-attach-webview sanitized', { src: params.src })
}

app.on('web-contents-created', (_, webContents) => {
  webContents.on('will-attach-webview', sanitizeWebviewPreferences)
  const session = webContents.session
  if (!documentPolicySessions.has(session)) {
    documentPolicySessions.add(session)
    session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Document-Policy': ['include-js-call-stacks-in-crash-reports']
        }
      })
    })
  }

  webContents.on('unresponsive', async () => {
    // Interrupt execution and collect call stack from unresponsive renderer
    logger.error('Renderer unresponsive start')
    try {
      const callStack = await webContents.mainFrame.collectJavaScriptCallStack()
      logger.error(`Renderer unresponsive js call stack\n ${callStack}`)
    } catch (error) {
      logger.error('Renderer unresponsive stack collection failed:', error as Error)
    }
  })
})

// H4：会话权限白名单（默认 deny）。
// 仅放行产品功能确实需要的低危权限：
//  - media/clipboard-read：语音输入录音、快速助手读取剪贴板（defaultSession）
//  - geolocation/fullscreen/notifications/openExternal：小程序与主窗口常见需求
// 其余（hid/serial/usb/midi/pointerLock/display-capture 等）一律拒绝。
const ALLOWED_PERMISSIONS = new Set<string>([
  'media',
  'mediaKeySystem',
  'geolocation',
  'fullscreen',
  'clipboard-read',
  'clipboard-sanitized-write',
  'notifications',
  'openExternal'
])

function isPermissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission)
}

function configureSessionPermissions(): void {
  // defaultSession 承载主窗口/挂件/快速助手；persist:webview 承载小程序 webview
  for (const sess of [session.defaultSession, session.fromPartition('persist:webview')]) {
    sess.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(isPermissionAllowed(permission))
    })
    sess.setPermissionCheckHandler((_wc, permission) => isPermissionAllowed(permission))
  }
}

// in production mode, handle uncaught exception and unhandled rejection globally
if (!isDev) {
  // handle uncaught exception
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error)
  })

  // handle unhandled rejection
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise} reason: ${reason}`)
  })
}

// Check for single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
} else {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.

  void app.whenReady().then(async () => {
    // Record current version for tracking
    // A preparation for v2 data refactoring
    versionService.recordCurrentVersion()

    initWebviewHotkeys()
    // Set app user model id for windows
    electronApp.setAppUserModelId(import.meta.env.VITE_MAIN_BUNDLE_ID || 'com.kangfenmao.CherryStudioBB')

    // H4：注册会话权限白名单（默认 deny），须在窗口创建前完成
    configureSessionPermissions()

    // Mac: Hide dock icon before window creation when launch to tray is set
    const isLaunchToTray = configManager.getLaunchToTray()
    if (isLaunchToTray) {
      app.dock?.hide()
    }

    // Check for backup restore marker and complete restoration (highest priority, before window creation)
    const { BackupManager } = await import('./services/BackupManager')
    await BackupManager.handleStartupRestore()

    const mainWindow = windowService.createMainWindow()

    // 桌面助手挂件开机自启（懒创建：仅开关开启时才建窗口；兼容老版本便签/音乐自启任一开启的配置）
    if (configManager.getMusicWidgetLaunchOnBoot() || configManager.getStickyWidgetLaunchOnBoot()) {
      windowService.showMusicWidget()
    }

    // 剪贴板历史监听：主进程常驻（不依赖挂件窗口开关），窗口随时呼出历史都是全的
    clipboardService.init()
    app.on('will-quit', () => clipboardService.stop())

    new TrayService()

    // Setup macOS application menu
    appMenuService?.setupApplicationMenu()

    powerMonitorService.init()

    // AI 自动化定时任务调度（主进程常驻，不依赖窗口）
    await automationService.init()

    // Extract bundled rtk binary to ~/.cherrystudio/bin/ on first run
    extractRtkBinaries().catch((error) => {
      logger.warn('Failed to extract rtk binaries (non-fatal)', {
        error: error instanceof Error ? error.message : String(error)
      })
    })

    app.on('activate', function () {
      const mainWindow = windowService.getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) {
        windowService.createMainWindow()
      } else {
        windowService.showMainWindow()
      }
    })

    registerShortcuts(mainWindow)

    await registerIpc(mainWindow, app)

    replaceDevtoolsFont(mainWindow)

    // Setup deep link for AppImage on Linux
    await setupAppImageDeepLink()

    if (isDev) {
      installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS])
        .then((name) => logger.info(`Added Extension:  ${name}`))
        .catch((err) => logger.error('An error occurred: ', err))
    }

    //start selection assistant service
    initSelectionService()

    //start screenshot service
    initScreenshotService()
  })

  registerProtocolClient(app)

  // macOS specific: handle protocol when app is already running
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleProtocolUrl(url)
  })

  const handleOpenUrl = (args: string[]) => {
    const url = args.find((arg) => arg.startsWith(CHERRY_STUDIO_PROTOCOL + '://'))
    if (url) handleProtocolUrl(url)
  }

  // for windows to start with url
  handleOpenUrl(process.argv)

  // Listen for second instance
  app.on('second-instance', (_event, argv) => {
    windowService.showMainWindow()

    // Protocol handler for Windows/Linux
    // The commandLine is an array of strings where the last item might be the URL
    handleOpenUrl(argv)
  })

  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  app.on('before-quit', () => {
    app.isQuitting = true
    if (selectionService) {
      selectionService.quit()
    }
    screenshotService.quit()
  })

  app.on('will-quit', async () => {
    try {
      automationService.destroy()
      await mcpService.cleanup()
    } catch (error) {
      logger.warn('Error cleaning up services:', error as Error)
    }
    logger.finish()
  })
}
