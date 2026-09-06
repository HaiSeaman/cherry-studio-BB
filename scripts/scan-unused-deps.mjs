// 编译 + 打包 Windows x64 EXE 安装包（文件名沿用历史，实际用途与“扫描依赖”无关）
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

console.log('=== [1/2] 开始编译 Electron 产物 (electron-vite build) ===')
const viteRes = spawnSync(process.execPath, ['node_modules/electron-vite/bin/electron-vite.js', 'build'], {
  stdio: 'inherit',
  env: process.env
})

if (viteRes.status !== 0) {
  console.error('electron-vite build 失败，退出码:', viteRes.status)
  process.exit(viteRes.status || 1)
}

const appVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
console.log(`\n=== [2/2] 开始打包 Windows ${appVersion} x64 EXE 安装包 (electron-builder) ===`)
const builderRes = spawnSync(process.execPath, ['node_modules/electron-builder/cli.js', '--win', '--x64'], {
  stdio: 'inherit',
  env: process.env
})

if (builderRes.status !== 0) {
  console.error('electron-builder 打包失败，退出码:', builderRes.status)
  process.exit(builderRes.status || 1)
}

console.log('\n=== 打包完成！检查 dist 产物目录 ===')
if (existsSync('dist')) {
  for (const f of readdirSync('dist')) {
    if (f.endsWith('.exe')) console.log('生成目标产物:', f)
  }
}
