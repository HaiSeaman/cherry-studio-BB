// don't reorder this file, it's used to initialize the app data dir and
// other which should be run before the main process is ready
// eslint-disable-next-line
import './bootstrap'

import '@main/config'

import { loggerService } from '@logger'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { replaceDevtoolsFont } from '@main/utils/windowUtil'
import { app } from 'electron'
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

app.on('web-contents-created', (_, webContents) => {
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

    // Mac: Hide dock icon before window creation when launch to tray is set
    const isLaunchToTray = configManager.getLaunchToTray()
    if (isLaunchToTray) {
      app.dock?.hide()
    }

    // Check for backup restore marker and complete restoration (highest priority, before window creation)
    const { BackupManager } = await import('./services/BackupManager')
    await BackupManager.handleStartupRestore()

    const mainWindow = windowService.createMainWindow()

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
