import './sticky.css'

import { createRoot } from 'react-dom/client'

import { applyThemeTokens } from '../themeTokens'
import StickyWidgetApp from './StickyWidgetApp'

// 跟随主程序配色：接收主窗口推送的主题 token，写入 CSS 变量
window.api.themeTokens.onChange((tokens) => applyThemeTokens(tokens))

createRoot(document.getElementById('root') as HTMLElement).render(<StickyWidgetApp />)
