import { isMac, isWin } from '@renderer/config/constant'
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

const tailwindThemeChange = (theme: ThemeMode) => {
  const root = window.document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

/**
 * 晨间绿洲 UI：固定浅色主题，不随系统/用户设置切换深色。
 * 保留 Context API 形状以兼容既有调用点，theme 恒为 light。
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { language } = useSettings()
  const [actualTheme] = useState<ThemeMode>(ThemeMode.light)
  const { initUserTheme } = useUserTheme()
  const { navbarPosition } = useNavbarPosition()

  // 固定浅色：toggle/setTheme 均为 no-op（深色模式已移除）
  const toggleTheme = () => {}
  const setTheme = () => {}

  useEffect(() => {
    // Set initial theme and OS attributes on body
    document.body.setAttribute('os', isMac ? 'mac' : isWin ? 'windows' : 'linux')
    document.body.setAttribute('theme-mode', actualTheme)
    document.body.classList.remove('dark')
    document.body.classList.add('light')
    document.body.setAttribute('navbar-position', navbarPosition)
    document.documentElement.lang = language

    initUserTheme()

    // listen for theme updates from main process
    return window.electron.ipcRenderer.on(IpcChannel.ThemeUpdated, () => {
      // 固定浅色：收到任何主题事件都保持 light
      document.body.setAttribute('theme-mode', ThemeMode.light)
      document.body.classList.remove('dark')
      document.body.classList.add('light')
    })
  }, [actualTheme, initUserTheme, language, navbarPosition])

  useEffect(() => {
    tailwindThemeChange(actualTheme)
  }, [actualTheme])

  useEffect(() => {
    void window.api.setTheme(ThemeMode.light)
  }, [])

  return (
    <ThemeContext value={{ theme: actualTheme, settedTheme: actualTheme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext>
  )
}

export const useTheme = () => use(ThemeContext)
