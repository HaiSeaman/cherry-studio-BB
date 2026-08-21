import { IpcChannel } from '@shared/IpcChannel'
import { act, cleanup, render } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../ThemeProvider'

/**
 * 用一个可变的外部 store 模拟 Redux settings.themeId,
 * 精确验证 ThemeProvider 切换主题时 body 属性是否原子更新。
 */
const state = {
  themeId: 'oasis' as string,
  themeMode: 'light' as 'light' | 'dark',
  language: 'zh-CN',
  userFontFamily: '',
  userCodeFontFamily: '',
  navbarPosition: 'left' as string
}

const setThemeId = (id: string) => {
  state.themeId = id
  state.themeMode = id === 'slate' || id === 'deepblue' ? 'dark' : 'light'
}

vi.mock('@renderer/hooks/useSettings', () => ({
  useSettings: () => ({
    themeId: state.themeId,
    theme: state.themeMode,
    language: state.language
  }),
  useNavbarPosition: () => ({ navbarPosition: state.navbarPosition })
}))

vi.mock('@renderer/hooks/useUserTheme', () => ({
  default: () => ({
    initUserTheme: () => {},
    setUserTheme: () => {}
  })
}))

vi.mock('@renderer/config/constant', () => ({
  isMac: false,
  isWin: true
}))

// mock window.api / window.electron
const mockPush = vi.fn()
const mockSetTheme = vi.fn()
vi.stubGlobal('api', {
  themeTokens: { push: mockPush },
  setTheme: mockSetTheme
})
vi.stubGlobal('electron', {
  ipcRenderer: { on: vi.fn().mockReturnValue(() => {}) }
})
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  cb(0)
  return 0
})
vi.stubGlobal('cancelAnimationFrame', () => {})

const App = ({ children }: PropsWithChildren) => <>{children}</>

describe('ThemeProvider body 属性设置', () => {
  beforeEach(() => {
    cleanup()
    state.themeId = 'oasis'
    state.themeMode = 'light'
    document.body.removeAttribute('theme-mode')
    document.body.removeAttribute('theme-id')
    mockPush.mockClear()
    mockSetTheme.mockClear()
    vi.clearAllMocks()
  })

  it('首次挂载: body 上设置 theme-mode=light 和 theme-id=oasis', async () => {
    await act(async () => {
      render(
        <App>
          <ThemeProvider>
            <div />
          </ThemeProvider>
        </App>
      )
    })
    expect(document.body.getAttribute('theme-mode')).toBe('light')
    expect(document.body.getAttribute('theme-id')).toBe('oasis')
  })

  it('切换到 sky: theme-id 和 theme-mode 原子更新为 sky/light', async () => {
    const { rerender } = render(
      <App>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </App>
    )
    await act(async () => {
      setThemeId('sky')
      rerender(
        <App>
          <ThemeProvider>
            <div />
          </ThemeProvider>
        </App>
      )
    })
    expect(document.body.getAttribute('theme-mode')).toBe('light')
    expect(document.body.getAttribute('theme-id')).toBe('sky')
  })

  it('切换到 deepblue: theme-id 和 theme-mode 原子更新为 deepblue/dark', async () => {
    const { rerender } = render(
      <App>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </App>
    )
    await act(async () => {
      setThemeId('deepblue')
      rerender(
        <App>
          <ThemeProvider>
            <div />
          </ThemeProvider>
        </App>
      )
    })
    expect(document.body.getAttribute('theme-mode')).toBe('dark')
    expect(document.body.getAttribute('theme-id')).toBe('deepblue')
  })

  it('主题从 deepblue 切回 sky: 两个属性都正确回切, 无残留 dark', async () => {
    const { rerender } = render(
      <App>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </App>
    )
    await act(async () => {
      setThemeId('deepblue')
      rerender(
        <App>
          <ThemeProvider>
            <div />
          </ThemeProvider>
        </App>
      )
    })
    await act(async () => {
      setThemeId('sky')
      rerender(
        <App>
          <ThemeProvider>
            <div />
          </ThemeProvider>
        </App>
      )
    })
    expect(document.body.getAttribute('theme-mode')).toBe('light')
    expect(document.body.getAttribute('theme-id')).toBe('sky')
  })

  it('ThemeUpdated 事件到达时, 用最新 themeId 重放属性', async () => {
    let listener: (() => void) | null = null
    vi.mocked(window.electron.ipcRenderer.on).mockImplementation(((channel: string, cb: () => void) => {
      if (channel === IpcChannel.ThemeUpdated) listener = cb
      return () => {}
    }) as any)

    const { rerender } = render(
      <App>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </App>
    )
    await act(async () => {
      setThemeId('butter')
      rerender(
        <App>
          <ThemeProvider>
            <div />
          </ThemeProvider>
        </App>
      )
    })
    // 模拟主进程发来 ThemeUpdated
    await act(async () => {
      listener?.()
    })
    expect(document.body.getAttribute('theme-mode')).toBe('light')
    expect(document.body.getAttribute('theme-id')).toBe('butter')
  })
})
