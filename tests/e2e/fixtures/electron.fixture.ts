import type { ElectronApplication, Page } from '@playwright/test'
import { _electron as electron, test as base } from '@playwright/test'

/**
 * Custom fixtures for Electron e2e testing.
 * Provides electronApp and mainWindow to all tests.
 */
export type ElectronFixtures = {
  electronApp: ElectronApplication
  mainWindow: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    // Launch Electron app from project root
    // The args ['.'] tells Electron to load the app from current directory
    const electronApp = await electron.launch({
      args: ['.', '--disable-gpu', '--no-sandbox'],
      env: {
        ...process.env,
        // ELECTRON_RUN_AS_NODE=1 (injected by some host environments) makes
        // Electron run in plain Node mode so require('electron') returns a
        // path string and the app crashes at startup. Always strip it.
        ELECTRON_RUN_AS_NODE: undefined,
        NODE_ENV: 'development'
      },
      timeout: 60000
    })

    await use(electronApp)

    // Cleanup: close the app after test
    await electronApp.close()
  },

  mainWindow: async ({ electronApp }, use) => {
    // Wait for the main window (title: "Cherry Studio", not "Quick Assistant")
    // On Mac, the app may create miniWindow for QuickAssistant with different title
    const mainWindow = await electronApp.waitForEvent('window', {
      predicate: async (window) => {
        const title = await window.title()
        return title === 'Cherry Studio'
      },
      timeout: 60000
    })

    // Wait for React app to mount
    await mainWindow.waitForSelector('#root', { state: 'attached', timeout: 60000 })

    // Wait for initial content to load
    await mainWindow.waitForLoadState('domcontentloaded')

    await use(mainWindow)
  }
})

export { expect } from '@playwright/test'
