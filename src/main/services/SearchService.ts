import { is } from '@electron-toolkit/utils'
import { loggerService } from '@logger'
import { BrowserWindow } from 'electron'

const logger = loggerService.withContext('SearchService')

/**
 * Only http/https pages may be loaded inside a search window.
 * Anything else (file:, data:, javascript:, ...) is rejected to prevent
 * arbitrary local file access / script execution inside the window.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Cap on simultaneously alive search windows. Each browser-mode web fetch
 * creates a window; without a cap a long-running session would leak one
 * window per fetched page.
 */
const MAX_SEARCH_WINDOWS = 5

function isAllowedUrl(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export class SearchService {
  private searchWindows: Record<string, BrowserWindow> = {}

  private async createNewSearchWindow(uid: string, show: boolean = false): Promise<BrowserWindow> {
    // Bound the number of live windows; evict the oldest hidden one when over the cap.
    const uids = Object.keys(this.searchWindows)
    while (uids.length >= MAX_SEARCH_WINDOWS) {
      const oldest = uids.shift()!
      this.closeSearchWindow(oldest).catch((error) => {
        logger.error(`Failed to evict search window ${oldest}:`, error as Error)
      })
    }

    const newWindow = new BrowserWindow({
      width: 1280,
      height: 768,
      show,
      webPreferences: {
        // Keep search windows fully sandboxed: loaded pages are untrusted web
        // content and must never gain Node.js/Electron privileges.
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: is.dev
      }
    })

    this.searchWindows[uid] = newWindow
    newWindow.on('closed', () => delete this.searchWindows[uid])

    newWindow.webContents.userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)  Safari/537.36'

    return newWindow
  }

  public async openSearchWindow(uid: string, show: boolean = false): Promise<void> {
    const existingWindow = this.searchWindows[uid]

    if (existingWindow) {
      show && existingWindow.show()
      return
    }

    await this.createNewSearchWindow(uid, show)
  }

  public async closeSearchWindow(uid: string): Promise<void> {
    const window = this.searchWindows[uid]
    if (window) {
      window.close()
      delete this.searchWindows[uid]
    }
  }

  public async openUrlInSearchWindow(uid: string, url: string): Promise<any> {
    // Security: only http/https URLs may be loaded in search windows.
    if (!isAllowedUrl(url)) {
      logger.warn(`Blocked loading untrusted URL in search window: ${url}`)
      return null
    }

    let window = this.searchWindows[uid]
    logger.debug(`Searching with URL: ${url}`)
    const isHiddenWindow = !window?.isVisible()
    if (window) {
      await window.loadURL(url)
    } else {
      window = await this.createNewSearchWindow(uid)
      await window.loadURL(url)
    }

    // Get the page content after loading the URL
    // Wait for the page to fully load before getting the content
    await new Promise<void>((resolve) => {
      const loadTimeout = setTimeout(() => resolve(), 10000) // 10 second timeout
      window.webContents.once('did-finish-load', () => {
        clearTimeout(loadTimeout)
        // Small delay to ensure JavaScript has executed
        setTimeout(resolve, 500)
      })
    })

    // Get the page content after ensuring it's fully loaded
    const content = await window.webContents.executeJavaScript('document.documentElement.outerHTML')

    // Hidden one-shot windows (used for web fetch) are closed right away so
    // they don't accumulate; visible windows (provider docs) stay open.
    if (isHiddenWindow) {
      await this.closeSearchWindow(uid)
    }

    return content
  }
}

export const searchService = new SearchService()
