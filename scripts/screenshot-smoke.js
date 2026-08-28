// Screenshot smoke test: verifies electron-screenshots can instantiate,
// capture the screen, show the overlay window and end cleanly.
// Run: electron scripts/screenshot-smoke.js  (window shows ~2s then auto-ends)
const { app } = require('electron')

// sandbox environments often have no GPU; fall back to software rendering
app.disableHardwareAcceleration()

let Screenshots
try {
  Screenshots = require('electron-screenshots').default || require('electron-screenshots')
} catch (e) {
  console.error('SMOKE FAILED: cannot load electron-screenshots:', e.message)
  app.exit(1)
}

app.whenReady().then(async () => {
  try {
    const s = new Screenshots()
    console.log('SMOKE: Screenshots instance created')

    s.on('ok', (_e, buffer, data) => {
      console.log('SMOKE: ok event, buffer bytes:', buffer.length, 'bounds:', JSON.stringify(data.bounds))
    })
    s.on('cancel', () => console.log('SMOKE: cancel event'))
    s.on('windowCreated', (win) => console.log('SMOKE: window created', win.getBounds()))

    await s.startCapture()
    console.log('SMOKE: startCapture resolved')

    // auto-end after 2s so the user is barely disturbed
    setTimeout(async () => {
      try {
        await s.endCapture()
        console.log('SMOKE: endCapture resolved')
        console.log('SMOKE: PASS')
        app.exit(0)
      } catch (e) {
        console.error('SMOKE FAILED: endCapture error:', e.message)
        app.exit(1)
      }
    }, 2000)
  } catch (e) {
    console.error('SMOKE FAILED:', e.message)
    app.exit(1)
  }
}).catch((e) => {
  console.error('SMOKE FAILED (ready):', e?.message ?? e)
  app.exit(1)
})
