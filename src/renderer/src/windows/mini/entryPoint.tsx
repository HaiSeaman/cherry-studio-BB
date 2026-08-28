import '@renderer/assets/styles/index.css'
import '@renderer/assets/styles/tailwind.css'
import '@ant-design/v5-patch-for-react-19'
import 'dayjs/locale/zh-cn'

import { loggerService } from '@logger'
import dayjs from 'dayjs'
import { createRoot } from 'react-dom/client'

import { initKeyv, subscribeStoreSync } from '../bootstrap'
import MiniWindowApp from './MiniWindowApp'

// 固定使用中文 locale（i18n 已移除）
dayjs.locale('zh-cn')

loggerService.initWindowSource('MiniWindow')

/**
 *  This function is required for model API
 *    eg. BaseProviders.ts
 *  Although the coupling is too strong, we have no choice but to load it
 *  In multi-window handling, decoupling is needed
 */
initKeyv()
subscribeStoreSync()

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<MiniWindowApp />)
