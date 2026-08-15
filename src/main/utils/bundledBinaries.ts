import { createRequire } from 'node:module'
import path from 'node:path'

import { toAsarUnpackedPath } from '.'

const require_ = createRequire(import.meta.url)

type BundledBinaryPlatform = 'darwin' | 'linux' | 'win32'

function assertSupportedTarget(
  binaryName: string,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture
): asserts platform is BundledBinaryPlatform {
  const supportedPlatform = platform === 'darwin' || platform === 'linux' || platform === 'win32'
  const supportedArchitecture = arch === 'arm64' || arch === 'x64'

  if (!supportedPlatform || !supportedArchitecture) {
    throw new Error(`Bundled ${binaryName} is not available for ${platform}-${arch}`)
  }
}

export function getRipgrepPlatformKey(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch
): string {
  assertSupportedTarget('ripgrep', platform, arch)
  return `${arch}-${platform}`
}

export function resolveBundledRipgrepPath(): string {
  const packageRoot = path.dirname(require_.resolve('@cherrystudio/ripgrep/package.json'))
  const executable = process.platform === 'win32' ? 'rg.exe' : 'rg'

  return toAsarUnpackedPath(path.join(packageRoot, 'vendor', 'ripgrep', getRipgrepPlatformKey(), executable))
}
