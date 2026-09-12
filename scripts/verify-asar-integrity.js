/*
 * app.asar 完整性自检
 *
 * 为什么需要它：
 * 一旦 asar 内的文件数据与头部记录的偏移/长度对不上（例如打包过程被
 * 外部 shell 包装器污染、工具链异常中断），出现的第一批受害者就是
 * `package.json` —— Electron / Node 解析到非法 JSON 会直接抛错。
 * 由于 Windows 打包版是 GUI 子系统程序、没有控制台，这个错误既不弹窗
 * 也不留日志，表现就是「双击没反应、任务管理器看不到进程」，
 * 排查成本极高。所以打包后必须自动校验，不合格就硬失败。
 *
 * 校验内容：
 *  1. 每一个 package.json 必须是合法 JSON，且带字符串 name；
 *  2. 根 package.json 必须带 main 字段（Electron 靠它找入口）。
 *
 * 用法： node scripts/verify-asar-integrity.js [asarPath]
 *      不传路径时默认检查 dist/win-unpacked/resources/app.asar
 */
const fs = require('fs')
const path = require('path')

const HEADER_PREFIX_SIZE = 16

function readAsar(asarPath) {
  const buf = fs.readFileSync(asarPath)
  // asar 头部：uint32 size(4) + uint32 pickleSize + uint32 jsonSize + uint32 jsonSize 副本
  const jsonSize = Math.min(buf.readUInt32LE(8), buf.readUInt32LE(12))
  const header = JSON.parse(buf.subarray(HEADER_PREFIX_SIZE, HEADER_PREFIX_SIZE + jsonSize).toString('utf8'))

  let dataOffset = HEADER_PREFIX_SIZE + jsonSize
  if (dataOffset % 4 !== 0) {
    dataOffset += 4 - (dataOffset % 4)
  }

  const readRange = (offset, size) => buf.subarray(dataOffset + offset, dataOffset + offset + size)

  return { header, readRange }
}

function collectFiles(node, prefix, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${name}` : name
    if (entry.files) {
      collectFiles(entry, p, out)
    } else if (!entry.unpacked) {
      out.push({ path: p, offset: Number(entry.offset), size: Number(entry.size) })
    }
  }
}

function verify(asarPath) {
  if (!fs.existsSync(asarPath)) {
    throw new Error(`未找到 asar：${asarPath}（请先执行 electron-builder 打包）`)
  }

  const { header, readRange } = readAsar(asarPath)
  const files = []
  collectFiles(header, '', files)

  const problems = []
  let pkgCount = 0

  const rootPkg = files.find((f) => f.path === 'package.json')
  if (!rootPkg) {
    problems.push('根 package.json 缺失（Electron 无法解析入口）')
  }

  for (const file of files) {
    if (!file.path.endsWith('package.json')) continue
    pkgCount += 1

    let text
    try {
      text = readRange(file.offset, file.size).toString('utf8')
    } catch (error) {
      problems.push(`${file.path}: 读取失败 ${error.message}`)
      continue
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      const preview = text.slice(0, 80).replace(/\s+/g, ' ')
      problems.push(`${file.path}: 不是合法 JSON（${error.message}）；开头内容：${preview}`)
      continue
    }

    // 注意：只校验「能否解析成 JSON」和根 package.json 的入口字段。
    // 不要强求每个 package.json 都有 name —— npm 包里 dist/commonjs/package.json
    // 这类文件本来就只有 { "type": "commonjs" }，强求会误报。
    if (file.path === 'package.json') {
      if (typeof parsed.name !== 'string' || parsed.name === '') {
        problems.push('根 package.json: 缺少 name 字段')
      }
      if (typeof parsed.main !== 'string') {
        problems.push('根 package.json: 缺少 main 字段（Electron 无法找到主进程入口）')
      }
    }
  }

  return { pkgCount, total: files.length, problems }
}

function main() {
  const asarPath = process.argv[2] || path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar')
  const { pkgCount, total, problems } = verify(asarPath)

  console.log(`[verify-asar] ${asarPath}`)
  console.log(`[verify-asar] 打包文件 ${total} 个，其中 package.json ${pkgCount} 个`)

  if (problems.length > 0) {
    console.error(`[verify-asar] 失败：发现 ${problems.length} 个问题，产物不可发布`)
    for (const p of problems.slice(0, 20)) {
      console.error(`  - ${p}`)
    }
    if (problems.length > 20) {
      console.error(`  ... 其余 ${problems.length - 20} 个问题已省略`)
    }
    process.exitCode = 1
    return
  }

  console.log('[verify-asar] 通过：所有 package.json 均为合法 JSON，入口字段完整')
}

if (require.main === module) {
  main()
}

module.exports = { verify }
