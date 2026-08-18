import { loggerService } from '@logger'
import { clipboard, nativeImage } from 'electron'
import Screenshots from 'electron-screenshots'

import { windowService } from './WindowService'

const logger = loggerService.withContext('ScreenshotService')

interface ScreenshotEvent {
  defaultPrevented: boolean
  preventDefault(): void
}

interface ScreenshotBounds {
  x: number
  y: number
  width: number
  height: number
}

interface ScreenshotData {
  bounds: ScreenshotBounds
  display: { id: number; x: number; y: number; width: number; height: number }
}

export type ScreenshotAction = 'ocr' | 'translate'

/**
 * ScreenshotService wraps the `electron-screenshots` plugin.
 *
 * Flow:
 *   globalShortcut → startCapture() → fullscreen overlay (crop + annotate)
 *   → ok/cancel/save events → dispatch result
 *
 * Note: Windows-only for now (user requirement), the plugin itself is cross-platform.
 */
class ScreenshotService {
  private screenshots: Screenshots | null = null
  private isCapturing = false
  private pendingScreenshot: Buffer | null = null
  private pendingAction: ScreenshotAction | null = null
  private wasMiniWindowVisible = false

  init() {
    if (this.screenshots) return

    try {
      this.screenshots = new Screenshots({
        lang: {
          magnifier_position_label: '位置',
          operation_ok_title: '确定',
          operation_cancel_title: '取消',
          operation_save_title: '保存',
          operation_redo_title: '重做',
          operation_undo_title: '撤销',
          operation_mosaic_title: '马赛克',
          operation_text_title: '文本',
          operation_brush_title: '画笔',
          operation_arrow_title: '箭头',
          operation_ellipse_title: '椭圆',
          operation_rectangle_title: '矩形'
        }
      })

      this.screenshots.on('ok', (_e: ScreenshotEvent, buffer: Buffer, data: ScreenshotData) => {
        this.handleOk(buffer, data)
      })
      this.screenshots.on('cancel', () => {
        logger.info('Screenshot cancelled by user')
        // restore the mini window if it was visible before the capture started
        if (this.wasMiniWindowVisible) {
          windowService.showMiniWindow()
        }
      })
      // "ocr"/"translate": screenshot toolbar buttons → auto-process in the mini window (no confirm)
      this.screenshots.on('ocr', (_e: ScreenshotEvent, buffer: Buffer) => {
        this.handleProcess(buffer, 'ocr')
      })
      this.screenshots.on('translate', (_e: ScreenshotEvent, buffer: Buffer) => {
        this.handleProcess(buffer, 'translate')
      })
      // "save" keeps the plugin default behavior: show the system save dialog and write the file.
      logger.info('ScreenshotService initialized')
    } catch (error) {
      logger.error('Failed to initialize ScreenshotService:', error as Error)
    }
  }

  async startCapture() {
    if (this.isCapturing) return

    this.init()
    if (!this.screenshots) return

    this.isCapturing = true

    // hide the mini window first so it is not captured in the screenshot
    this.wasMiniWindowVisible = windowService.getMiniWindow()?.isVisible() ?? false
    windowService.hideMiniWindow()

    try {
      await this.screenshots.startCapture()
    } catch (error) {
      logger.error('Failed to start screenshot capture:', error as Error)
    } finally {
      this.isCapturing = false
    }
  }

  private handleOk(buffer: Buffer, data: ScreenshotData) {
    if (!buffer || buffer.length === 0) {
      logger.warn('Screenshot ok event with empty buffer, ignored')
      return
    }
    logger.info(`Screenshot captured: ${buffer.length} bytes, bounds: ${JSON.stringify(data.bounds)}`)

    // copy to clipboard so the user can paste it anywhere
    this.copyToClipboard(buffer)

    // keep the screenshot in a pending slot; the mini window pulls it on show (pull model,
    // immune to window creation/loading timing). The clipboard copy above is the fallback.
    this.pendingScreenshot = buffer
    this.pendingAction = null
    windowService.showMiniWindow()
  }

  private handleProcess(buffer: Buffer, action: ScreenshotAction) {
    if (!buffer || buffer.length === 0) {
      logger.warn(`Screenshot ${action} event with empty buffer, ignored`)
      return
    }
    logger.info(`Screenshot process requested: ${action}, ${buffer.length} bytes`)

    // keep the screenshot + action in pending slots; the mini window pulls them on show
    // and auto-sends to the AI (no further confirmation)
    this.pendingScreenshot = buffer
    this.pendingAction = action
    windowService.showMiniWindow()
  }

  /**
   * Consume the pending screenshot, called by the mini window when it shows.
   * Returns a copy of the buffer + action and clears the slots so each screenshot
   * is inserted only once.
   */
  consumePendingScreenshot(): { buffer: Buffer; action: ScreenshotAction | null } | null {
    const buffer = this.pendingScreenshot
    const action = this.pendingAction
    this.pendingScreenshot = null
    this.pendingAction = null
    if (!buffer) return null
    return { buffer, action }
  }

  copyToClipboard(buffer: Buffer) {
    clipboard.writeImage(nativeImage.createFromBuffer(buffer))
  }

  quit() {
    this.screenshots = null
  }
}

const screenshotService = new ScreenshotService()

export default screenshotService
export const initScreenshotService = () => {
  screenshotService.init()
}
