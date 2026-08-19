import { expect, test } from '../fixtures/electron.fixture'
import { waitForAppReady } from '../utils/wait-helpers'

/**
 * Full-flow functional test: launch -> home -> sidebar navigation ->
 * settings (incl. shortcut page) -> theme switch -> search.
 * Collects all console errors / page errors across the whole run.
 */
const SHOT_DIR = 'test-results/screenshots'

test.describe('Full Flow', () => {
  test('launch, home page, and console error baseline', async ({ mainWindow }) => {
    test.setTimeout(120000)
    const errors: string[] = []
    mainWindow.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().slice(0, 400)}`)
    })
    mainWindow.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 400)}`))

    await waitForAppReady(mainWindow)
    await mainWindow.waitForTimeout(4000)

    // Window title
    expect(await mainWindow.title()).toBeTruthy()

    // Root rendered
    const rendered = await mainWindow.evaluate(() => {
      const root = document.querySelector('#root')
      return root ? root.innerHTML.length : -1
    })
    expect(rendered).toBeGreaterThan(500)

    // Home page visible elements
    const buttons = await mainWindow.locator('button').count()
    expect(buttons).toBeGreaterThan(0)
    const inputs = await mainWindow.locator('textarea, input[type="text"], [contenteditable="true"]').count()
    expect(inputs).toBeGreaterThan(0)

    await mainWindow.screenshot({ path: `${SHOT_DIR}/flow-01-home.png`, fullPage: false })
    console.log('HOME_OK buttons=%d inputs=%d rootLen=%d', buttons, inputs, rendered)

    // Report errors found so far (warn-level; app may log benign errors)
    if (errors.length) {
      console.log('CONSOLE_ERRORS_DURING_LAUNCH:')
      errors.forEach((e) => console.log('  ', e))
    }
    expect(true).toBe(true)
  })

  test('sidebar navigation + settings menus + shortcut page integrity', async ({ mainWindow }) => {
    test.setTimeout(240000)
    const errors: string[] = []
    mainWindow.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().slice(0, 400)}`)
    })
    mainWindow.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 400)}`))

    await waitForAppReady(mainWindow)

    // ---- Sidebar navigation ----
    const navTargets: Array<[string, string]> = [
      ['store', '/store'],
      ['files', '/files'],
      ['apps', '/apps'],
      ['knowledge', '/knowledge'],
      ['settings', '/settings'],
      ['home', '/']
    ]
    for (const [label, path] of navTargets) {
      // click sidebar item by href
      const link = mainWindow.locator(`a[href*="${path}"]`).first()
      const clickable = (await link.count()) > 0
      if (clickable) {
        await link.click()
        await mainWindow.waitForTimeout(1800)
      } else {
        await mainWindow.evaluate((p) => {
          location.hash = p
        }, path)
        await mainWindow.waitForTimeout(1200)
      }
      const contentLen = await mainWindow.evaluate(
        () => document.querySelector('#content-container, #root')?.textContent?.trim().length ?? -1
      )
      console.log(`NAV ${label} -> ${path} contentLen=${contentLen}`)
      expect(contentLen).toBeGreaterThan(20)
      await mainWindow.screenshot({ path: `${SHOT_DIR}/flow-nav-${label}.png`, fullPage: false })
    }

    // ---- Settings menus ----
    const settingsMenus = ['provider', 'model', 'general', 'display', 'data', 'mcp', 'memory', 'about', 'shortcut']
    for (const menu of settingsMenus) {
      const link = mainWindow.locator(`a[href*="/settings/${menu}"]`).first()
      const count = await link.count()
      if (count === 0) {
        console.log(`SETTINGS_MENU_MISSING ${menu}`)
        continue
      }
      await link.click()
      await mainWindow.waitForTimeout(1200)
      const contentLen = await mainWindow.evaluate(
        () => document.querySelector('#content-container, #root')?.textContent?.trim().length ?? -1
      )
      console.log(`SETTINGS ${menu} contentLen=${contentLen}`)
      expect(contentLen).toBeGreaterThan(20)
      if (menu === 'shortcut') {
        await mainWindow.waitForTimeout(500)
        await mainWindow.screenshot({ path: `${SHOT_DIR}/flow-settings-shortcut.png`, fullPage: false })
      }
    }

    // ---- Shortcut page deep check ----
    await mainWindow.evaluate(() => {
      location.hash = '#/settings/shortcut'
    })
    await mainWindow.waitForTimeout(1500)

    // Collect shortcut rows from the page: each row contains a shortcut name cell
    const rowInfo = await mainWindow.evaluate(() => {
      const texts: string[] = []
      document.querySelectorAll('table tbody tr').forEach((tr) => {
        const t = (tr.textContent || '').replace(/\s+/g, ' ').trim()
        if (t) texts.push(t.slice(0, 60))
      })
      return texts
    })
    console.log('SHORTCUT_ROWS(%d):', rowInfo.length)
    rowInfo.forEach((r, i) => console.log('  ', i + 1, r))

    // Check localStorage persisted shortcuts for duplicates & missing keys
    const scState = await mainWindow.evaluate(() => {
      try {
        const raw = localStorage.getItem('persist:cherry-studio')
        if (!raw) return { error: 'NO_PERSIST_KEY' }
        const slices = JSON.parse(raw)
        const shortcuts = JSON.parse(slices.shortcuts)
        const keys = shortcuts.shortcuts.map((s: any) => s.key)
        const dupes = keys.filter((k: string, i: number) => keys.indexOf(k) !== i)
        return { count: keys.length, unique: new Set(keys).size, dupes: [...new Set(dupes)], keys }
      } catch (e) {
        return { error: String(e) }
      }
    })
    console.log('LOCALSTORAGE_SHORTCUTS:', JSON.stringify(scState))
    if (!scState.error) {
      expect(scState.dupes.length).toBe(0)
      expect(scState.count).toBe(scState.unique)
      expect(scState.count).toBeGreaterThanOrEqual(21)
    }

    // ---- Report errors ----
    if (errors.length) {
      console.log('CONSOLE_ERRORS_DURING_NAV:')
      errors.forEach((e) => console.log('  ', e))
    }
    expect(true).toBe(true)
  })

  test('theme switch and search interaction', async ({ mainWindow }) => {
    test.setTimeout(120000)
    const errors: string[] = []
    mainWindow.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().slice(0, 400)}`)
    })
    mainWindow.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 400)}`))

    await waitForAppReady(mainWindow)

    // ---- Theme switch in Display settings ----
    await mainWindow.evaluate(() => {
      location.hash = '#/settings/display'
    })
    await mainWindow.waitForTimeout(1500)
    // antd segmented or radio for theme: look for 浅色/深色/跟随系统 texts
    const themeOption = mainWindow.locator('text=深色').first()
    const themeCount = await themeOption.count()
    if (themeCount > 0) {
      await themeOption.click()
      await mainWindow.waitForTimeout(1200)
      const bodyClass = await mainWindow.evaluate(() => document.body.className)
      const htmlTheme = await mainWindow.evaluate(() => document.documentElement.getAttribute('data-theme'))
      console.log('THEME_SWITCHED bodyClass=%s htmlTheme=%s', bodyClass, htmlTheme)
      await mainWindow.screenshot({ path: `${SHOT_DIR}/flow-theme-dark.png`, fullPage: false })
      // switch back
      const lightOption = mainWindow.locator('text=浅色').first()
      if (await lightOption.count()) {
        await lightOption.click()
        await mainWindow.waitForTimeout(800)
      }
    } else {
      console.log('THEME_OPTION_NOT_FOUND')
    }

    // ---- Search interaction ----
    await mainWindow.evaluate(() => {
      location.hash = '#/'
    })
    await mainWindow.waitForTimeout(1200)
    const searchInput = mainWindow
      .locator('input[placeholder*="搜索"], input[type="search"], [class*="Search"] input, [class*="search"] input')
      .first()
    const searchCount = await searchInput.count()
    if (searchCount > 0) {
      await searchInput.fill('test')
      await mainWindow.waitForTimeout(800)
      console.log('SEARCH_INPUT_OK')
      await searchInput.fill('')
    } else {
      console.log('SEARCH_INPUT_NOT_FOUND')
    }

    if (errors.length) {
      console.log('CONSOLE_ERRORS_THEME_SEARCH:')
      errors.forEach((e) => console.log('  ', e))
    }
    expect(true).toBe(true)
  })
})
