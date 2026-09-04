import './music.css'

import { createRoot } from 'react-dom/client'

import { applyThemeTokens } from '../themeTokens'
import MusicWidgetApp from './MusicWidgetApp'

// 跟随主程序配色：接收主窗口推送的主题 token，写入 CSS 变量
window.api.themeTokens.onChange((tokens) => applyThemeTokens(tokens))

// 启动即主动拉一次主进程缓存的最新 token：
// 若主窗口此刻在后台（rAF 被系统节流），推送链路可能延迟，主动拉取保证挂件一打开就跟随主题
void window.api.themeTokens.pullCached().then((tokens) => {
  if (tokens) applyThemeTokens(tokens)
})

createRoot(document.getElementById('root') as HTMLElement).render(<MusicWidgetApp />)
