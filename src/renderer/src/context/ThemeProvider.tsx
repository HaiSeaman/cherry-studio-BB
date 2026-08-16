import { isMac, isWin } from '@renderer/config/constant'
import { getThemeMode } from '@renderer/config/themes'
import { useNavbarPosition, useSettings } from '@renderer/hooks/useSettings'
import useUserTheme from '@renderer/hooks/useUserTheme'
import { ThemeMode } from '@renderer/types'
import { IpcChannel } from '@shared/IpcChannel'
import type { PropsWithChildren } from 'react'
import React, { createContext, use, useEffect, useState } from 'react'

interface ThemeContextType {
  theme: ThemeMode
  settedTheme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: ThemeMode.light,
  settedTheme: ThemeMode.light,
  toggleTheme: () => {},
  setTheme: () => {}
})

interface ThemeProviderProps extends PropsWithChildren {
  defaultTheme?: ThemeMode
}

const tailwindThemeChange = (mode: 'light' | 'dark') => {
  const root = window.document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(mode)
}

/**
 * 主题系统：由 settings.themeId 驱动（4 款浅色 + 2 款深色，见 config/themes.ts）。
 * body 上设置 theme-mode / theme-id 两个属性，配合 color.css 分支切换整套色板。
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { themeId, language } = useSettings()
  const { initUserTheme } = useUserTheme()
  const { navbarPosition } = useNavbarPosition()

  const mode = getThemeMode(themeId)
  const [theme, setThemeState] = useState<ThemeMode>(mode === 'dark' ? ThemeMode.dark : ThemeMode.light)

  useEffect(() => {
    setThemeState(mode === 'dark' ? ThemeMode.dark : ThemeMode.light)
  }, [mode])

  // toggle/setTheme 兼容保留：无 UI 入口，直接切换到默认浅色主题
  const toggleTheme = () => {}
  const setTheme = () => {}

  useEffect(() => {
    // Set initial theme and OS attributes on body
    document.body.setAttribute('os', isMac ? 'mac' : isWin ? 'windows' : 'linux')
    document.body.setAttribute('theme-mode', mode)
    document.body.setAttribute('theme-id', themeId)
    document.body.classList.remove('dark', 'light')
    document.body.classList.add(mode)
    document.body.setAttribute('navbar-position', navbarPosition)
    document.documentElement.lang = language

    initUserTheme()

    // main 进程的主题事件：渲染进程以 themeId 为准，仅重放当前主题属性
    return window.electron.ipcRenderer.on(IpcChannel.ThemeUpdated, () => {
      document.body.setAttribute('theme-mode', mode)
      document.body.setAttribute('theme-id', themeId)
      document.body.classList.remove('dark', 'light')
      document.body.classList.add(mode)
    })
  }, [themeId, mode, initUserTheme, language, navbarPosition])

  useEffect(() => {
    tailwindThemeChange(mode)
  }, [mode])

  useEffect(() => {
    void window.api.setTheme(mode === 'dark' ? ThemeMode.dark : ThemeMode.light)
  }, [mode])

  return <ThemeContext value={{ theme, settedTheme: theme, toggleTheme, setTheme }}>{children}</ThemeContext>
}

export const useTheme = () => use(ThemeContext)
