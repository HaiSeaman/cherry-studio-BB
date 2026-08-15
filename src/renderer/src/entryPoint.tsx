import './assets/styles/index.css'
import './assets/styles/tailwind.css'
import '@ant-design/v5-patch-for-react-19'
import 'dayjs/locale/zh-cn'

import dayjs from 'dayjs'
import { createRoot } from 'react-dom/client'

import App from './App'

// 固定使用中文 locale（i18n 已移除）
dayjs.locale('zh-cn')

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)
