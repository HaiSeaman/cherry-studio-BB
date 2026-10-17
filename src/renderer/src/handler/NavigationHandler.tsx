import { useAppSelector } from '@renderer/store'
import { IpcChannel } from '@shared/IpcChannel'
import { useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useLocation, useNavigate } from 'react-router-dom'

const NavigationHandler: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const showSettingsShortcutEnabled = useAppSelector(
    (state) => state.shortcuts.shortcuts.find((s) => s.key === 'show_settings')?.enabled
  )

  useHotkeys(
    'meta+, ! ctrl+,',
    function () {
      if (location.pathname.startsWith('/settings')) {
        return
      }
      navigate('/settings/provider')
    },
    {
      splitKey: '!',
      enableOnContentEditable: true,
      enableOnFormTags: true,
      enabled: showSettingsShortcutEnabled
    }
  )

  // macOS 应用菜单「关于」：关于信息（版本、开源协议等）位于「常规设置」页底部。
  // 原先跳转的 /settings/about 路由并不存在，属失效跳转，这里改为真实页面。
  useEffect(() => {
    const handleNavigateToAbout = () => {
      navigate('/settings/general')
    }

    const removeListener = window.electron.ipcRenderer.on(IpcChannel.Windows_NavigateToAbout, handleNavigateToAbout)

    return () => {
      removeListener()
    }
  }, [navigate])

  return null
}

export default NavigationHandler
