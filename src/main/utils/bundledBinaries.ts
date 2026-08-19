import { createRequire } from 'node:module'
import path from 'node:path'

import { toAsarUnpackedPath } from '.'

const require_ = createRequire(import.meta.url)

// 本应用仅面向 Windows x64 构建发布，ripgrep 固定使用 x64-win32 变体。
const RIPGREP_PLATFORM_KEY = 'x64-win32'
const RIPGREP_EXECUTABLE = 'rg.exe'

export function getRipgrepPlatformKey(): string {
  return RIPGREP_PLATFORM_KEY
}

export function resolveBundledRipgrepPath(): string {
  const packageRoot = path.dirname(require_.resolve('@cherrystudio/ripgrep/package.json'))

  return toAsarUnpackedPath(path.join(packageRoot, 'vendor', 'ripgrep', RIPGREP_PLATFORM_KEY, RIPGREP_EXECUTABLE))
}
