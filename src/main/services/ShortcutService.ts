/**
 * @deprecated Scheduled for removal in v2.0.0
 * --------------------------------------------------------------------------
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING (by 0xfullex)
 * --------------------------------------------------------------------------
 * STOP: Feature PRs affecting this file are currently BLOCKED.
 * Only critical bug fixes are accepted during this migration phase.
 *
 * This file is being refactored to v2 standards.
 * Any non-critical changes will conflict with the ongoing work.
 *
 * 🔗 Context & Status:
 * - Contribution Hold: https://github.com/CherryHQ/cherry-studio/issues/10954
 * - v2 Refactor PR   : https://github.com/CherryHQ/cherry-studio/pull/10162
 * --------------------------------------------------------------------------
 */
import { loggerService } from '@logger'
import { handleZoomFactor } from '@main/utils/zoom'
import type { Shortcut } from '@types'
import type { BrowserWindow } from 'electron'
import { globalShortcut } from 'electron'

import { convertShortcutFormat } from '../utils/shortcut'
import { configManager } from './ConfigManager'
import screenshotService from './ScreenshotService'
import selectionService from './SelectionService'
import { windowService } from './WindowService'

const logger = loggerService.withContext('ShortcutService')

// universal shortcuts stay registered even when the main window loses focus
const UNIVERSAL_SHORTCUT_KEYS = [
  'show_app',
  'mini_window',
  'selection_assistant_toggle',
  'selection_assistant_select_text',
  'screenshot'
]

//indicate if the shortcuts are registered on app boot time
let isRegisterOnBoot = true

// store the focus and blur handlers for each window to unregister them later
const windowOnHandlers = new Map<BrowserWindow, { onFocusHandler: () => void; onBlurHandler: () => void }>()

function getShortcutHandler(shortcut: Shortcut) {
  switch (shortcut.key) {
    case 'zoom_in':
      return (window: BrowserWindow) => handleZoomFactor([window], 0.1)
    case 'zoom_out':
      return (window: BrowserWindow) => handleZoomFactor([window], -0.1)
    case 'zoom_reset':
      return (window: BrowserWindow) => handleZoomFactor([window], 0, true)
    case 'show_app':
      return () => {
        windowService.toggleMainWindow()
      }
    case 'mini_window':
      return () => {
        // 在处理器内部检查QuickAssistant状态，而不是在注册时检查
        const quickAssistantEnabled = configManager.getEnableQuickAssistant()
        logger.info(`mini_window shortcut triggered, QuickAssistant enabled: ${quickAssistantEnabled}`)

        if (!quickAssistantEnabled) {
          logger.warn('QuickAssistant is disabled, ignoring mini_window shortcut trigger')
          return
        }

        windowService.toggleMiniWindow()
      }
    case 'selection_assistant_toggle':
      return () => {
        if (selectionService) {
          selectionService.toggleEnabled()
        }
      }
    case 'selection_assistant_select_text':
      return () => {
        if (selectionService) {
          selectionService.processSelectTextByShortcut()
        }
      }
    case 'screenshot':
      return () => {
        screenshotService.startCapture()
      }
    default:
      return null
  }
}

function registerZoomShortcut(accelerator: string, handler: (window: BrowserWindow) => void, window: BrowserWindow) {
  if (!globalShortcut.register(accelerator, () => handler(window))) {
    logger.warn(`Failed to register zoom shortcut ${accelerator}`)
  }
}

export function registerShortcuts(window: BrowserWindow) {
  if (isRegisterOnBoot) {
    window.once('ready-to-show', () => {
      if (configManager.getLaunchToTray()) {
        registerOnlyUniversalShortcuts()
      }
    })
    isRegisterOnBoot = false
  }

  //only for clearer code
  const registerOnlyUniversalShortcuts = () => {
    register(true)
  }

  //onlyUniversalShortcuts is used to register shortcuts that are not window specific, like show_app & mini_window
  //onlyUniversalShortcuts is needed when we launch to tray
  const register = (onlyUniversalShortcuts: boolean = false) => {
    if (window.isDestroyed()) return

    const shortcuts = configManager.getShortcuts()
    if (!shortcuts) return

    shortcuts.forEach((shortcut) => {
      try {
        if (shortcut.shortcut.length === 0) {
          return
        }

        //if not enabled, exit early from the process.
        if (!shortcut.enabled) {
          return
        }

        // only register universal shortcuts when needed
        if (onlyUniversalShortcuts && !UNIVERSAL_SHORTCUT_KEYS.includes(shortcut.key)) {
          return
        }

        const handler = getShortcutHandler(shortcut)
        if (!handler) {
          return
        }

        //the following ZOOMs are hard-coded and registered separately, so will return
        switch (shortcut.key) {
          case 'zoom_in':
            registerZoomShortcut('CommandOrControl+=', handler, window)
            registerZoomShortcut('CommandOrControl+numadd', handler, window)
            return

          case 'zoom_out':
            registerZoomShortcut('CommandOrControl+-', handler, window)
            registerZoomShortcut('CommandOrControl+numsub', handler, window)
            return

          case 'zoom_reset':
            registerZoomShortcut('CommandOrControl+0', handler, window)
            return
        }

        const accelerator = convertShortcutFormat(shortcut.shortcut)

        if (!globalShortcut.register(accelerator, () => handler(window))) {
          logger.warn(`Failed to register shortcut "${shortcut.key}" (${accelerator}): already registered or unavailable`)
        }
      } catch (error) {
        logger.warn(`Failed to register shortcut ${shortcut.key}`)
      }
    })
  }

  // when the main window blurs we unregister the window-scoped shortcuts, then
  // re-register the enabled universal ones straight from the current config.
  // Reading the config (instead of caching accelerators) keeps disabled shortcuts
  // disabled even after a blur cycle.
  const unregister = () => {
    if (window.isDestroyed()) return

    try {
      globalShortcut.unregisterAll()

      const shortcuts = configManager.getShortcuts()
      if (!shortcuts) return

      shortcuts.forEach((shortcut) => {
        if (shortcut.shortcut.length === 0 || !shortcut.enabled) {
          return
        }
        if (!UNIVERSAL_SHORTCUT_KEYS.includes(shortcut.key)) {
          return
        }

        const handler = getShortcutHandler(shortcut)
        if (!handler) {
          return
        }

        const accelerator = convertShortcutFormat(shortcut.shortcut)
        globalShortcut.register(accelerator, () => handler(window))
      })
    } catch (error) {
      logger.warn('Failed to unregister shortcuts')
    }
  }

  // only register the event handlers once
  if (undefined === windowOnHandlers.get(window)) {
    // pass register() directly to listener, the func will receive Event as argument, it's not expected
    const registerHandler = () => {
      register()
    }
    window.on('focus', registerHandler)
    window.on('blur', unregister)
    windowOnHandlers.set(window, { onFocusHandler: registerHandler, onBlurHandler: unregister })
  }

  if (!window.isDestroyed() && window.isFocused()) {
    register()
  }
}

export function unregisterAllShortcuts() {
  try {
    windowOnHandlers.forEach((handlers, window) => {
      window.off('focus', handlers.onFocusHandler)
      window.off('blur', handlers.onBlurHandler)
    })
    windowOnHandlers.clear()
    globalShortcut.unregisterAll()
  } catch (error) {
    logger.warn('Failed to unregister all shortcuts')
  }
}
