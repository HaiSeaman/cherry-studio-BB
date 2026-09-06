// 临时验证脚本：Electron 无界面窗口加载真实构建产物，验证内置主题与自定义 CSS 的层叠关系
const path = require('path')
const fs = require('fs')
const { app, BrowserWindow } = require('electron')

const ASSETS_DIR = path.join(__dirname, '..', 'out', 'renderer', 'assets')

app.disableHardwareAcceleration()

app
  .whenReady()
  .then(async () => {
    // 产物 CSS 文件名带内容 hash（如 AntdProvider-LGLMWC6G.css），每次构建会变，自动匹配
    const cssFile = fs
      .readdirSync(ASSETS_DIR)
      .filter((f) => f.startsWith('AntdProvider-') && f.endsWith('.css'))
      .sort()
      .pop()
    if (!cssFile) {
      console.error('未找到 AntdProvider-*.css，请先运行 npx electron-vite build')
      app.exit(1)
      return
    }
    const css = fs.readFileSync(path.join(ASSETS_DIR, cssFile), 'utf8')
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
    await win.loadURL('data:text/html,<html><head></head><body></body></html>')

    const script = `
    (function () {
      const css = ${JSON.stringify(css)};
      const read = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
      const r = {};

      // 1. 注入真实构建产物（含 @layer theme-color 内置主题）
      const s1 = document.createElement('style');
      s1.textContent = css;
      document.head.appendChild(s1);

      // 2. 默认主题 oasis：变量应来自 :root（theme-color 层内）
      document.body.setAttribute('theme-id', 'oasis');
      document.body.setAttribute('theme-mode', 'light');
      r.oasisPrimary = read('--color-primary');

      // 3. 切到 sky：主题分支应生效（层内特异性 [theme-mode][theme-id] > :root）
      document.body.setAttribute('theme-id', 'sky');
      r.skyPrimary = read('--color-primary');

      // 4. 模拟设置页注入自定义 CSS（un-layered <style>，cherrycss.com 原版写法）
      const s2 = document.createElement('style');
      s2.id = 'user-defined-custom-css';
      s2.textContent = "body[theme-mode='light'] { --color-primary: #ff0000; --color-background: #123456; }";
      document.head.appendChild(s2);
      r.customInSky = read('--color-primary');

      // 5. 自定义 CSS 作用域说明：:root 作用于 html，会被 body 上的主题分支变量遮蔽
      //    （与原版 Cherry Studio 行为一致，非回归）。正确写法是 body[theme-mode=...] / body[theme-id=...]
      s2.textContent = "body[theme-id='sky'] { --color-primary: #00ff00; }";
      r.customBodyScope = read('--color-primary');

      // 6. 移除自定义 CSS 后 sky 主题恢复
      s2.textContent = '';
      r.skyAfterRemoveCustom = read('--color-primary');

      // 7. Tailwind theme 层的 --color-background 映射不得翻身（仍应为 sky 色板值）
      r.skyBackground = read('--color-background');

      return r;
    })()
  `

    const result = await win.webContents.executeJavaScript(script)

    const expect = {
      oasisPrimary: '#10b981',
      skyPrimary: '#2e9bd6',
      customInSky: '#ff0000',
      customBodyScope: '#00ff00',
      skyAfterRemoveCustom: '#2e9bd6',
      skyBackground: '#f1f7fb'
    }
    let pass = true
    for (const k of Object.keys(expect)) {
      const ok = result[k] === expect[k]
      if (!ok) pass = false
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${k} = ${result[k]} (期望 ${expect[k]})`)
    }
    console.log(pass ? '=== 全部通过 ===' : '=== 存在失败 ===')
    app.exit(pass ? 0 : 1)
  })
  .catch((err) => {
    console.error('验证脚本异常:', err)
    app.exit(1)
  })
