const { Arch } = require('electron-builder')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { parse, stringify } = require('yaml')

const workspaceConfigPath = path.join(__dirname, '..', 'pnpm-workspace.yaml')

// if you want to add new prebuild binaries packages with different architectures, you can add them here
// please add to allX64 and allArm64 from pnpm-lock.yaml
const packages = [
  // @napi-rs/canvas platform binaries (pulled in by pdf-parse/pdfjs-dist).
  // Only the current platform's variant must ship; everything else is excluded.
  '@napi-rs/canvas-android-arm64',
  '@napi-rs/canvas-darwin-arm64',
  '@napi-rs/canvas-darwin-x64',
  '@napi-rs/canvas-linux-arm-gnueabihf',
  '@napi-rs/canvas-linux-arm64-gnu',
  '@napi-rs/canvas-linux-arm64-musl',
  '@napi-rs/canvas-linux-riscv64-gnu',
  '@napi-rs/canvas-linux-x64-gnu',
  '@napi-rs/canvas-linux-x64-musl',
  '@napi-rs/canvas-win32-arm64-msvc',
  '@napi-rs/canvas-win32-x64-msvc'
]

const platformToArch = {
  mac: 'darwin',
  windows: 'win32',
  linux: 'linux',
  linuxmusl: 'linuxmusl'
}

const ripgrepTargets = ['arm64-darwin', 'arm64-linux', 'arm64-win32', 'x64-darwin', 'x64-linux', 'x64-win32']
const rtkTargets = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64']

function getTargetPackageFilters({ platform, arch }, packageNames = packages) {
  const keepPackages = packageNames.filter(
    (packageName) => packageName.includes(arch) && packageName.includes(platform)
  )
  const excludePackageFilters = packageNames
    .filter((packageName) => !keepPackages.includes(packageName))
    .map((packageName) => '!node_modules/' + packageName + '/**')

  const excludeRipgrepFilters = ripgrepTargets
    .filter((target) => target !== `${arch}-${platform}`)
    .map((target) => '!node_modules/@cherrystudio/ripgrep/vendor/ripgrep/' + target + '/**')

  const currentPlatformKey = `${platform}-${arch}`
  const excludeRtkFilters = rtkTargets
    .filter((target) => target !== currentPlatformKey)
    .map((target) => '!resources/binaries/' + target + '/**')

  return [...excludePackageFilters, ...excludeRipgrepFilters, ...excludeRtkFilters]
}

/**
 * koffi（语音输入「逐字输入到光标」用的 FFI 库）在 Windows 上只能通过可选平台包
 * @koromix/koffi-win32-x64 拿到预编译绑定，而 pnpm 把该平台包放在虚拟仓库里
 * （koffi 包目录的同级），electron-builder 收集依赖时看不到它 —— 打出来的包会缺
 * 真正的 koffi.node，语音输入静默失效。
 *
 * koffi 官方加载器的回退路径包含 koffi 包内的 build/koffi/<平台>_<arch>/koffi.node，
 * 这里就按该路径把绑定拷进 koffi 包内；electron-builder.yml 的 asarUnpack 已覆盖
 * node_modules 下的 koffi 目录，运行时 .node 会被重定向到 asar 外正常加载。
 */
function copyKoffiNativeBinding(platform, arch, rootDir = path.join(__dirname, '..')) {
  const koffiDir = path.join(rootDir, 'node_modules', 'koffi')
  if (!fs.existsSync(koffiDir)) {
    throw new Error(`找不到 koffi 包（${koffiDir}）。请先执行 pnpm install：缺少它语音输入的逐字输入会完全失效`)
  }

  const binding = `@koromix/koffi-${platform}-${arch}`
  const candidates = []
  try {
    // pnpm：node_modules/koffi 是指向 .pnpm/<koffi>/node_modules/koffi 的符号链接，
    // 平台包就在它的同级目录下
    candidates.push(path.join(path.dirname(fs.realpathSync(koffiDir)), binding))
  } catch {
    // 符号链接解析失败时忽略，继续尝试其它布局
  }
  // 被提升到根 node_modules 的布局（npm / 手动提升）
  candidates.push(path.join(rootDir, 'node_modules', binding))

  const bindingDir = candidates.find((candidate) => fs.existsSync(candidate))
  if (!bindingDir) {
    // 必须硬失败：只 warn 的话会打出一个「装上就能用、其实语音输入完全不出字」的版本
    throw new Error(
      `未找到 koffi 平台包 ${binding}（尝试过 ${candidates.join(' / ')}）。` +
        `请执行 pnpm install 后重新打包；否则打包版语音输入将静默失效`
    )
  }

  // 平台包内按 <平台>_<abi> 分目录（例如 win32_x64、linux_x64、musl_x64），全部拷过去
  let copied = 0
  for (const entry of fs.readdirSync(bindingDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const source = path.join(bindingDir, entry.name, 'koffi.node')
    if (!fs.existsSync(source)) continue

    const target = path.join(koffiDir, 'build', 'koffi', entry.name, 'koffi.node')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
    copied += 1
    console.log(`Copied koffi native binding -> ${path.relative(rootDir, target)}`)
  }

  if (copied === 0) {
    throw new Error(`${binding} 里没有找到任何 koffi.node（目录：${bindingDir}），打包版语音输入会失效`)
  }
}

exports.getTargetPackageFilters = getTargetPackageFilters
exports.copyKoffiNativeBinding = copyKoffiNativeBinding

exports.default = async function (context) {
  const arch = context.arch === Arch.arm64 ? 'arm64' : 'x64'
  const platformName = context.packager.platform.name
  const platform = platformToArch[platformName]

  // Download rtk binary for the target platform
  try {
    console.log(`Downloading rtk binary for ${platform}-${arch}...`)
    execSync(`node "${path.join(__dirname, 'download-rtk-binaries.js')}" ${platform} ${arch}`, { stdio: 'inherit' })
  } catch (error) {
    console.warn(`Warning: rtk binary download failed (non-fatal): ${error.message}`)
  }

  const downloadPackages = async () => {
    // Skip if target platform and architecture match current system
    if (platform === process.platform && arch === process.arch) {
      console.log(`Skipping install: target (${platform}/${arch}) matches current system`)
      return
    }

    console.log(`Installing packages for target platform=${platform} arch=${arch}...`)

    // Backup and modify pnpm-workspace.yaml to add target platform support
    const originalWorkspaceConfig = fs.readFileSync(workspaceConfigPath, 'utf-8')
    const workspaceConfig = parse(originalWorkspaceConfig)

    // Add target platform to supportedArchitectures.os
    if (!workspaceConfig.supportedArchitectures.os.includes(platform)) {
      workspaceConfig.supportedArchitectures.os.push(platform)
    }

    // Add target architecture to supportedArchitectures.cpu
    if (!workspaceConfig.supportedArchitectures.cpu.includes(arch)) {
      workspaceConfig.supportedArchitectures.cpu.push(arch)
    }

    const modifiedWorkspaceConfig = stringify(workspaceConfig)
    console.log('Modified workspace config:', modifiedWorkspaceConfig)
    fs.writeFileSync(workspaceConfigPath, modifiedWorkspaceConfig)

    try {
      execSync(`pnpm install`, { stdio: 'inherit' })
    } finally {
      // Restore original pnpm-workspace.yaml
      fs.writeFileSync(workspaceConfigPath, originalWorkspaceConfig)
    }
  }

  await downloadPackages()

  // koffi 原生绑定：必须在 electron-builder 收集 node_modules 之前放进 koffi 包内
  copyKoffiNativeBinding(platform, arch)

  const excludePackages = async (packagesToExclude) => {
    // 从项目根目录的 electron-builder.yml 读取 files 配置，避免多次覆盖配置导致出错
    const electronBuilderConfigPath = path.join(__dirname, '..', 'electron-builder.yml')
    const electronBuilderConfig = parse(fs.readFileSync(electronBuilderConfigPath, 'utf-8'))
    const files = electronBuilderConfig.files
    const firstFileSet = files.find((entry) => typeof entry === 'object' && entry.filter)

    // 把其他平台的二进制排除规则追加到第一个 FileSet 的 filter 内，
    // 避免独立字符串条目与对象条目分属不同 matcher 导致排除失效
    if (firstFileSet) {
      firstFileSet.filter.push(...packagesToExclude)
    }

    context.packager.config.files = files
  }

  await excludePackages(getTargetPackageFilters({ platform, arch }))
}
