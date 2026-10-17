import { loggerService } from '@logger'

const logger = loggerService.withContext('WebviewStateManager')

// Global WebView loaded states - shared between popup and tab modes
const globalWebviewStates = new Map<string, boolean>()

/**
 * Set WebView loaded state for a specific app
 * @param appId - The mini-app ID
 * @param loaded - Whether the WebView is loaded
 */
export const setWebviewLoaded = (appId: string, loaded: boolean) => {
  globalWebviewStates.set(appId, loaded)
  logger.debug(`WebView state set for ${appId}: ${loaded}`)
}

/**
 * Get WebView loaded state for a specific app
 * @param appId - The mini-app ID
 * @returns Whether the WebView is loaded
 */
export const getWebviewLoaded = (appId: string): boolean => {
  return globalWebviewStates.get(appId) || false
}

/**
 * Clear WebView state for a specific app
 * @param appId - The mini-app ID
 */
export const clearWebviewState = (appId: string) => {
  const wasLoaded = globalWebviewStates.delete(appId)
  if (wasLoaded) {
    logger.debug(`WebView state cleared for ${appId}`)
  }
}
