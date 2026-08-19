/// <reference types="vite/client" />

import type KeyvStorage from '@kangfenmao/keyv-storage'
import type { HookAPI } from 'antd/es/modal/useModal'
import type { NavigateFunction } from 'react-router-dom'

import type { closeAll, closeToast, error, info, loading, success, warning } from './components/TopView/toast'

interface ImportMetaEnv {
  VITE_RENDERER_INTEGRATED_MODEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    root: HTMLElement
    modal: HookAPI
    keyv: KeyvStorage
    store: any
    navigate: NavigateFunction
    toast: {
      closeToast: typeof closeToast
      closeAll: typeof closeAll
      error: typeof error
      success: typeof success
      warning: typeof warning
      info: typeof info
      loading: typeof loading
    }
  }
}
