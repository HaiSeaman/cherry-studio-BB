import { afterAll, describe, expect, it } from 'vitest'

const { getTargetPackageFilters, copyKoffiNativeBinding } = require('../before-pack.js') as {
  getTargetPackageFilters: (target: { platform: string; arch: string }, packageNames?: string[]) => string[]
  copyKoffiNativeBinding: (platform: string, arch: string, rootDir?: string) => void
}

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ripgrepFilter = (target: string) => `!node_modules/@cherrystudio/ripgrep/vendor/ripgrep/${target}/**`
const rtkFilter = (target: string) => `!resources/binaries/${target}/**`

describe('getTargetPackageFilters', () => {
  it('keeps only native ARM64 resources for Windows ARM64', () => {
    const filters = getTargetPackageFilters({ platform: 'win32', arch: 'arm64' })

    expect(filters).not.toContain(ripgrepFilter('arm64-win32'))
    expect(filters).toContain(ripgrepFilter('x64-win32'))
    expect(filters).toContain(rtkFilter('win32-x64'))
  })

  it('keeps only native x64 resources for Windows x64', () => {
    const filters = getTargetPackageFilters({ platform: 'win32', arch: 'x64' })

    expect(filters).not.toContain(ripgrepFilter('x64-win32'))
    expect(filters).toContain(ripgrepFilter('arm64-win32'))
    expect(filters).not.toContain(rtkFilter('win32-x64'))
  })

  it('keeps only the target macOS architecture', () => {
    const filters = getTargetPackageFilters({ platform: 'darwin', arch: 'arm64' })

    expect(filters).not.toContain(ripgrepFilter('arm64-darwin'))
    expect(filters).toContain(ripgrepFilter('x64-darwin'))
    expect(filters).not.toContain(rtkFilter('darwin-arm64'))
  })

  it('keeps both libc variants for the target Linux architecture', () => {
    const filters = getTargetPackageFilters({ platform: 'linux', arch: 'x64' })

    expect(filters).not.toContain(ripgrepFilter('x64-linux'))
    expect(filters).toContain(ripgrepFilter('arm64-linux'))
    expect(filters).not.toContain(rtkFilter('linux-x64'))
  })
})

/** 搭一个假的 node_modules 布局（刻意不用符号链接：沙箱里建 symlink 会被拒绝） */
function makeRoot(layout: 'hoisted' | 'no-koffi' | 'no-binding') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'koffi-pack-'))

  if (layout !== 'no-koffi') {
    fs.mkdirSync(path.join(root, 'node_modules', 'koffi'), { recursive: true })
  }

  if (layout !== 'no-binding') {
    // 被提升到根 node_modules 的平台包布局
    const dir = path.join(root, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'koffi.node'), 'fake-koffi-binary')
  }

  return root
}

describe('copyKoffiNativeBinding', () => {
  const roots: string[] = []
  const newRoot = (layout: Parameters<typeof makeRoot>[0]) => {
    const root = makeRoot(layout)
    roots.push(root)
    return root
  }

  afterAll(() => {
    for (const root of roots) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('把平台包里的 koffi.node 拷进 koffi 包内 build/koffi/<平台>_<arch>/（koffi 加载器的回退路径）', () => {
    const root = newRoot('hoisted')

    copyKoffiNativeBinding('win32', 'x64', root)

    const target = path.join(root, 'node_modules', 'koffi', 'build', 'koffi', 'win32_x64', 'koffi.node')
    expect(fs.existsSync(target)).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toBe('fake-koffi-binary')
  })

  it('找不到平台包时硬失败（否则会打出语音输入静默失效的包）', () => {
    const root = newRoot('no-binding')

    expect(() => copyKoffiNativeBinding('win32', 'x64', root)).toThrow(/pnpm install/)
  })

  it('连 koffi 包都没有时硬失败', () => {
    const root = newRoot('no-koffi')

    expect(() => copyKoffiNativeBinding('win32', 'x64', root)).toThrow(/pnpm install/)
  })

  it('平台包存在但没有 koffi.node 时硬失败', () => {
    const root = newRoot('hoisted')
    fs.rmSync(path.join(root, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'))

    expect(() => copyKoffiNativeBinding('win32', 'x64', root)).toThrow(/koffi\.node/)
  })
})
