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

  it('always maps ripgrep to the Windows x64 variant', () => {
    expect(getRipgrepPlatformKey()).toBe('x64-win32')
  })

  it('resolves installed native executables for the current host', () => {
    expect(resolveBundledRipgrepPath()).toContain('@cherrystudio+ripgrep')
  })

  it('executes the bundled ripgrep binary on the current host', () => {
    const ripgrepVersion = execFileSync(resolveBundledRipgrepPath(), ['--version'], { encoding: 'utf-8' })

    expect(ripgrepVersion).toContain('ripgrep')
  })
})
