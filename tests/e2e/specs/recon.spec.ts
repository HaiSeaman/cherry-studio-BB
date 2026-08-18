import { expect, test } from '../fixtures/electron.fixture'
import { waitForAppReady } from '../utils/wait-helpers'

/**
 * Reconnaissance spec: dump DOM structure of key pages so we can write
 * accurate selectors for the full-flow test. Not a real assertion suite.
 */
const dump = (page: any, label: string) =>
  page.evaluate((l: string) => {
    const info: any = { label: l, url: location.hash, title: document.title }
    // Buttons & links text
    info.buttons = Array.from(document.querySelectorAll('button, a[role="button"], [class*="Button"]'))
      .map((el) => (el.textContent || '').trim().slice(0, 30))
      .filter(Boolean)
      .slice(0, 60)
    // Nav items
    info.navItems = Array.from(document.querySelectorAll('a[href], [class*="nav-item"], [class*="SideBar"] *'))
      .map((el) => {
        const text = (el.textContent || '').trim().slice(0, 24)
        const href = (el as any).getAttribute?.('href') || ''
        return text ? `${text}|${href}` : ''
      })
      .filter(Boolean)
      .slice(0, 50)
    // Inputs & textareas
    info.inputs = Array.from(document.querySelectorAll('input, textarea')).map((el) => ({
      ph: (el as any).placeholder || '',
      cls: (el as any).className?.toString().slice(0, 40) || ''
    }))
    // Section headings
    info.headings = Array.from(document.querySelectorAll('h1,h2,h3,[class*="Title"]')).map((el) =>
      (el.textContent || '').trim().slice(0, 40)
    )
    return info
  }, label)

test.describe('Recon', () => {
  test('dump home + settings structure', async ({ mainWindow, electronApp }) => {
    test.setTimeout(120000)
    const errors: string[] = []
    mainWindow.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().slice(0, 300)}`)
    })
    mainWindow.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 300)}`))

    await waitForAppReady(mainWindow)
    await mainWindow.waitForTimeout(3000)
    console.log('=== HOME ===')
    console.log(JSON.stringify(await dump(mainWindow, 'home'), null, 1))

    // Navigate to settings via hash
    await mainWindow.evaluate(() => { location.hash = '#/settings' })
    await mainWindow.waitForTimeout(2500)
    console.log('=== SETTINGS ===')
    console.log(JSON.stringify(await dump(mainWindow, 'settings'), null, 1))

    // Try to find shortcut settings item
    const shortcutLink = mainWindow.locator('text=快捷键').first()
    if (await shortcutLink.count()) {
      await shortcutLink.click()
      await mainWindow.waitForTimeout(2500)
      console.log('=== SHORTCUT SETTINGS ===')
      console.log(JSON.stringify(await dump(mainWindow, 'shortcuts'), null, 1))
      await mainWindow.screenshot({ path: 'test-results/screenshots/recon-shortcuts.png', fullPage: false })
    } else {
      console.log('=== NO 快捷键 LINK FOUND ===')
      // Dump all clickable items text
      const items = await mainWindow.evaluate(() =>
        Array.from(document.querySelectorAll('*'))
          .filter((el) => (el.textContent || '').trim().length > 0 && (el.textContent || '').trim().length < 40)
          .map((el) => (el.textContent || '').trim())
          .filter((t, i, a) => a.indexOf(t) === i)
          .slice(0, 80)
      )
      console.log(JSON.stringify(items, null, 1))
    }

    await mainWindow.screenshot({ path: 'test-results/screenshots/recon-settings.png', fullPage: false })
    console.log('=== ERRORS SO FAR ===')
    console.log(JSON.stringify(errors, null, 1))

    // localStorage shortcut check
    const sc = await mainWindow.evaluate(() => {
      try {
        const raw = localStorage.getItem('persist:cherry-studio')
        if (!raw) return 'NO PERSIST KEY'
        const slices = JSON.parse(raw)
        const shortcuts = JSON.parse(slices.shortcuts)
        return shortcuts.shortcuts.map((s: any) => s.key)
      } catch (e) {
        return `parse error: ${String(e)}`
      }
    })
    console.log('=== SHORTCUT KEYS IN localStorage ===')
    console.log(JSON.stringify(sc))

    expect(true).toBe(true)
  })
})
