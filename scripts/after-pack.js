const fs = require('fs')
const path = require('path')

const { verify } = require('./verify-asar-integrity')

exports.default = async function (context) {
  const platform = context.packager.platform.name
  if (platform === 'windows') {
    fs.rmSync(path.join(context.appOutDir, 'LICENSE.electron.txt'), { force: true })
    fs.rmSync(path.join(context.appOutDir, 'LICENSES.chromium.html'), { force: true })
  }

  // 硬校验 app.asar：一旦打包过程被打断或被外部 shell 包装器污染，asar 内的文件
  // 数据就会与头部偏移错位，package.json 首当其冲变成非法 JSON。打包版是 GUI 子系统
  // 程序、没有控制台，这种损坏在用户机上表现为「双击没反应、进程都看不到」，
  // 排查代价极高。这里直接让打包失败，绝不让坏产物出厂。
  const asarPath = path.join(context.appOutDir, 'resources', 'app.asar')
  if (fs.existsSync(asarPath)) {
    const { pkgCount, total, problems } = verify(asarPath)
    if (problems.length > 0) {
      throw new Error(
        `app.asar 完整性校验失败（共 ${total} 个文件 / ${pkgCount} 个 package.json，` +
          `${problems.length} 个问题）。首个问题：${problems[0]}。` +
          `请勿发布该产物，建议清理 dist 后重新打包`
      )
    }
    console.log(`  • app.asar 完整性校验通过  files=${total} packageJson=${pkgCount}`)
  }
}
