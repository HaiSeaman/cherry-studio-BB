import { execFileSync } from 'node:child_process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/Applications/Cherry Studio.app/Contents/Resources/app.asar'),
    isPackaged: false
  }
}))

import { app } from 'electron'

import { getRipgrepPlatformKey, resolveBundledRipgrepPath } from '../bundledBinaries'

describe('bundled native binaries', () => {
  beforeEach(() => {
    vi.mocked(app.getAppPath).mockReturnValue('/Applications/Cherry Studio.app/Contents/Resources/app.asar')
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: false })
  })

  it('maps ripgrep to the target platform and architecture', () => {
    expect(getRipgrepPlatformKey('win32', 'arm64')).toBe('arm64-win32')
    expect(getRipgrepPlatformKey('win32', 'x64')).toBe('x64-win32')
    expect(getRipgrepPlatformKey('darwin', 'arm64')).toBe('arm64-darwin')
    expect(getRipgrepPlatformKey('linux', 'x64')).toBe('x64-linux')
  })

  it('rejects unsupported ripgrep targets', () => {
    expect(() => getRipgrepPlatformKey('freebsd', 'x64')).toThrow('Bundled ripgrep is not available for freebsd-x64')
    expect(() => getRipgrepPlatformKey('win32', 'ia32')).toThrow('Bundled ripgrep is not available for win32-ia32')
  })

  it('resolves installed native executables for the current host', () => {
    expect(resolveBundledRipgrepPath()).toContain('@cherrystudio+ripgrep')
  })

  it('executes the bundled ripgrep binary on the current host', () => {
    const ripgrepVersion = execFileSync(resolveBundledRipgrepPath(), ['--version'], { encoding: 'utf-8' })

    expect(ripgrepVersion).toContain('ripgrep')
  })
})
