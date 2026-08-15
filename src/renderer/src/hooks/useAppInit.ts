import PrivacyPolicyUpdateNotice from '@renderer/components/app/PrivacyPolicyUpdateNotice'
import { isMac, LATEST_PRIVACY_POLICY_VERSION } from '@renderer/config/constant'
import { isLocalAi } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import db from '@renderer/databases'
import { handleSaveData, useAppDispatch } from '@renderer/store'
import { setAvatar, setFilesPath, setResourcesPath } from '@renderer/store/runtime'
import { checkDataLimit } from '@renderer/utils'
import { IpcChannel } from '@shared/IpcChannel'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'

import { useDefaultModel } from './useAssistant'
import useFullScreenNotice from './useFullScreenNotice'
import { useRuntime } from './useRuntime'
import { useNavbarPosition, useSettings } from './useSettings'

export function useAppInit() {
  const dispatch = useAppDispatch()
  const { proxyUrl, proxyBypassRules, windowStyle, proxyMode, customCss, privacyPolicyVersion } = useSettings()
  const { isLeftNavbar } = useNavbarPosition()
  const { minappShow } = useRuntime()
  const { setDefaultModel, setQuickModel, setTranslateModel } = useDefaultModel()
  const avatar = useLiveQuery(() => db.settings.get('image://avatar'))
  const { theme } = useTheme()

  useEffect(() => {
    document.getElementById('spinner')?.remove()
    // eslint-disable-next-line no-restricted-syntax
    console.timeEnd('init')
  }, [])

  useEffect(() => {
    void window.api.getDataPathFromArgs().then((dataPath) => {
      if (dataPath) {
        window.navigate('/settings/data', { replace: true })
      }
    })
  }, [])

  useEffect(() => {
    window.electron.ipcRenderer.on(IpcChannel.App_SaveData, async () => {
      await handleSaveData()
    })
  }, [])

  useFullScreenNotice()

  useEffect(() => {
    if (privacyPolicyVersion === LATEST_PRIVACY_POLICY_VERSION) {
      PrivacyPolicyUpdateNotice.hide()
      return
    }

    void PrivacyPolicyUpdateNotice.show()
  }, [privacyPolicyVersion])

  useEffect(() => {
    avatar?.value && dispatch(setAvatar(avatar.value))
  }, [avatar, dispatch])

  useEffect(() => {
    if (proxyMode === 'system') {
      void window.api.setProxy('system', undefined)
    } else if (proxyMode === 'custom') {
      void (proxyUrl && window.api.setProxy(proxyUrl, proxyBypassRules))
    } else {
      // set proxy to none for direct mode
      void window.api.setProxy('', undefined)
    }
  }, [proxyUrl, proxyMode, proxyBypassRules])

  useEffect(() => {
    const isMacTransparentWindow = windowStyle === 'transparent' && isMac

    if (minappShow && isLeftNavbar) {
      window.root.style.background = isMacTransparentWindow ? 'var(--color-background)' : 'var(--navbar-background)'
      return
    }

    window.root.style.background = isMacTransparentWindow ? 'var(--navbar-background-mac)' : 'var(--navbar-background)'
  }, [windowStyle, minappShow, theme, isLeftNavbar])

  useEffect(() => {
    if (isLocalAi) {
      const model = JSON.parse(import.meta.env.VITE_RENDERER_INTEGRATED_MODEL)
      setDefaultModel(model)
      setQuickModel(model)
      setTranslateModel(model)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // set files path
    void window.api.getAppInfo().then((info) => {
      dispatch(setFilesPath(info.filesPath))
      dispatch(setResourcesPath(info.resourcesPath))
    })
  }, [dispatch])

  useEffect(() => {
    let customCssElement = document.getElementById('user-defined-custom-css') as HTMLStyleElement
    if (customCssElement) {
      customCssElement.remove()
    }

    if (customCss) {
      customCssElement = document.createElement('style')
      customCssElement.id = 'user-defined-custom-css'
      customCssElement.textContent = customCss
      document.head.appendChild(customCssElement)
    }
  }, [customCss])

  useEffect(() => {
    void checkDataLimit()
  }, [])
}
