import {
  Clipboard as ClipboardIcon,
  CloudSun,
  ExternalLink,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  Music2,
  Pin,
  PinOff,
  Radio,
  SquareCheckBig,
  StickyNote,
  Unlock,
  X
} from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'

import type { RadioStation } from '../../pages/music/types'
import ClipboardView from './ClipboardView'
import FmRadioView from './FmRadioView'
import LocalPlayerView from './LocalPlayerView'
import NotesView, { flushPendingDraft, TodosView } from './NotesTodosView'
import type { WidgetPlayerState } from './protocol'
import { emitPosition, onHostMessage, sendCmd } from './transport'
import WeatherView from './weather/WeatherView'

type View = 'weather' | 'clipboard' | 'local' | 'fm' | 'notes' | 'todos'

const VIEW_STORAGE_KEY = 'musicWidgetView'
/** 天气固定在第一位（剪贴板左边） */
const VIEWS: View[] = ['weather', 'clipboard', 'local', 'fm', 'notes', 'todos']
const isView = (v: unknown): v is View => typeof v === 'string' && (VIEWS as string[]).includes(v)

/** 各视图默认窗口内容尺寸（挂件窗口 useContentSize:true，与 setContentSize 语义一致） */
const VIEW_DEFAULT_SIZE: Record<View, { w: number; h: number }> = {
  weather: { w: 380, h: 470 },
  clipboard: { w: 340, h: 460 },
  local: { w: 380, h: 220 },
  fm: { w: 380, h: 220 },
  notes: { w: 320, h: 480 },
  todos: { w: 320, h: 440 }
}
const VIEW_META: Record<View, { icon: React.ReactNode; title: string }> = {
  weather: { icon: <CloudSun size={13} />, title: '天气' },
  clipboard: { icon: <ClipboardIcon size={13} />, title: '剪贴板' },
  local: { icon: <Music2 size={13} />, title: '本地音乐' },
  fm: { icon: <Radio size={13} />, title: 'FM 电台' },
  notes: { icon: <StickyNote size={13} />, title: '便签' },
  todos: { icon: <SquareCheckBig size={13} />, title: '待办' }
}

const sizeKey = (v: View) => `musicWidgetViewSize:${v}`

function readViewSize(v: View): { w: number; h: number } {
  try {
    const s = JSON.parse(localStorage.getItem(sizeKey(v)) ?? '')
    if (s && Number.isFinite(s.w) && Number.isFinite(s.h) && s.w >= 200 && s.h >= 100) return { w: s.w, h: s.h }
  } catch {
    /* 脏数据回落默认 */
  }
  return VIEW_DEFAULT_SIZE[v]
}

/**
 * 桌面助手挂件（音乐挂件扩展为 6 模块：天气 / 剪贴板 / 本地音乐 / FM 电台 / 便签 / 待办）。
 * 轻量独立入口，无 antd/Redux/router；数据与主程序共享同一 Dexie。
 * - 天气：免费无 Key 的 Open-Meteo 接口，数据层见 ./weather/api.ts
 * - 本地/FM：纯遥控器，播放命令经主进程中转 IPC 发往主窗口 playerStore
 * - 便签/待办：Dexie 直读写，useLiveQuery 跨窗口实时双向同步
 * 便签/待办等视图始终挂载（切换仅 CSS 隐藏），保证草稿防抖与 pagehide 兜底不被卸载打断；
 * 天气视图首次切到才挂载（避免挂件启动就去 IP 定位），挂载后同样保持常驻。
 * 切换视图时按 per-view 记忆尺寸自动调整窗口（天气 380×470 / 剪贴板 340×460 ↔ 音乐 380×220）。
 */
const MusicWidgetApp: FC = () => {
  const [pinned, setPinned] = useState(true)
  const [locked, setLocked] = useState(false)
  const [state, setState] = useState<WidgetPlayerState | null>(null)
  const [connected, setConnected] = useState(false)
  const [stations, setStations] = useState<RadioStation[]>([])
  const [view, setView] = useState<View>(() => {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    return isView(v) ? v : 'local'
  })
  // 天气面板延迟挂载：首次切到天气 tab 才创建，避免挂件一启动就去 IP 定位/上报网络请求
  const [weatherVisited, setWeatherVisited] = useState(() => view === 'weather')
  const snapshotTimer = useRef<number>(0)
  const viewSwitchRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<View>(view)
  // 程序化 setSize 时间戳：resize 回存时忽略其引发的事件，避免把默认尺寸回写覆盖用户手动调整
  const lastAutoResize = useRef(0)

  viewRef.current = view

  // 挂载即请求快照；2s 无应答显示"未连接主程序"占位（主窗口渲染进程不可达的边界场景）
  useEffect(() => {
    sendCmd({ t: 'snapshot:req' })
    snapshotTimer.current = window.setTimeout(() => setConnected(false), 2000)
    return () => window.clearTimeout(snapshotTimer.current)
  }, [])

  useEffect(
    () =>
      onHostMessage((msg) => {
        switch (msg.t) {
          case 'snapshot':
            // 收到快照即表明主进程可达：取消 2s 超时，避免挂件打开后永远"假未连接"
            window.clearTimeout(snapshotTimer.current)
            setConnected(true)
            setStations(msg.stations)
            setState(msg.s)
            emitPosition(msg.s.position, msg.s.duration)
            // 首次快照：初始视图跟随主窗口当前播放源；此后记住用户自己的选择
            if (localStorage.getItem(VIEW_STORAGE_KEY) == null) {
              localStorage.setItem(VIEW_STORAGE_KEY, msg.s.source)
              setView(msg.s.source)
            }
            break
          case 'update':
            window.clearTimeout(snapshotTimer.current)
            setConnected(true)
            setState(msg.s)
            emitPosition(msg.s.position, msg.s.duration)
            break
          case 'pos':
            emitPosition(msg.p, msg.d)
            break
          default:
            break
        }
      }),
    []
  )

  // 最大化状态：按钮点击后 / 切视图触发还原（主进程 setSize 守卫）后都向主进程回查，避免图标漂移
  const [maximized, setMaximized] = useState(false)
  const syncMaximized = () => void window.api.musicWidget.isMaximized().then(setMaximized)
  const toggleMaximize = () => {
    void window.api.musicWidget.toggleMaximize().then(syncMaximized)
  }

  const switchView = (v: View) => {
    setView(v)
    if (v === 'weather') setWeatherVisited(true)
    localStorage.setItem(VIEW_STORAGE_KEY, v)
    // 切换视图 → 应用该视图记忆的窗口尺寸
    const s = readViewSize(v)
    lastAutoResize.current = Date.now()
    void window.api.musicWidget.setSize(Math.round(s.w), Math.round(s.h))
    syncMaximized()
  }

  // 窄窗口下 tab 可能横向滚动，切换后把当前按钮滚进可见区，避免选中项看不见
  useEffect(() => {
    const active = viewSwitchRef.current?.querySelector<HTMLElement>('button.active')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [view])

  // 手动调整窗口尺寸 → 防抖回存到当前视图（忽略程序化 setSize 引发的事件）
  useEffect(() => {
    let t = 0
    const onResize = () => {
      if (Date.now() - lastAutoResize.current < 400) return
      clearTimeout(t)
      t = window.setTimeout(() => {
        try {
          localStorage.setItem(
            sizeKey(viewRef.current),
            JSON.stringify({ w: window.innerWidth, h: window.innerHeight })
          )
        } catch {
          /* 存储不可用时忽略 */
        }
      }, 300)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const close = () => {
    // 先落库未保存草稿，确保「速记后立即关闭」不丢字
    void flushPendingDraft().then(() => window.api.musicWidget.close())
  }

  return (
    <div className="app">
      <header className={`header ${locked ? 'locked' : ''}`}>
        <span className="title">
          <Music2 size={12} className="title-icon" /> 桌面助手
        </span>
        <div className="btns view-switch" ref={viewSwitchRef}>
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              title={VIEW_META[v].title}
              className={`mode-btn ${view === v ? 'active' : ''}`}
              onClick={() => switchView(v)}>
              {VIEW_META[v].icon}
            </button>
          ))}
        </div>
        <div className="btns">
          <button
            type="button"
            title={maximized ? '还原' : '最大化'}
            className={maximized ? 'active' : ''}
            onClick={toggleMaximize}>
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            title={pinned ? '取消置顶' : '置顶'}
            className={pinned ? 'active' : ''}
            onClick={() => {
              setPinned(!pinned)
              void window.api.musicWidget.setPin(!pinned)
            }}>
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
          <button
            type="button"
            title={locked ? '解锁' : '锁定'}
            className={locked ? 'active' : ''}
            onClick={() => {
              setLocked(!locked)
              void window.api.musicWidget.setLock(!locked)
            }}>
            {locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button type="button" title="打开主程序" onClick={() => void window.api.musicWidget.openMain()}>
            <ExternalLink size={13} />
          </button>
          <button type="button" title="最小化" onClick={() => void window.api.musicWidget.toggle()}>
            <Minus size={14} />
          </button>
          <button type="button" title="关闭" className="close" onClick={close}>
            <X size={14} />
          </button>
        </div>
      </header>

      <main className="body">
        <div className={`view-panel ${view === 'weather' ? '' : 'hidden'}`}>{weatherVisited && <WeatherView />}</div>
        <div className={`view-panel ${view === 'clipboard' ? '' : 'hidden'}`}>
          <ClipboardView />
        </div>
        <div className={`view-panel ${view === 'local' ? '' : 'hidden'}`}>
          {!connected ? <Disconnected /> : <LocalPlayerView state={state} />}
        </div>
        <div className={`view-panel ${view === 'fm' ? '' : 'hidden'}`}>
          {!connected ? <Disconnected /> : <FmRadioView state={state} stations={stations} />}
        </div>
        <div className={`view-panel ${view === 'notes' ? '' : 'hidden'}`}>
          <NotesView />
        </div>
        <div className={`view-panel ${view === 'todos' ? '' : 'hidden'}`}>
          <TodosView />
        </div>
      </main>
    </div>
  )
}

/** 主窗口渲染进程不可达时的占位（仅本地/FM 视图需要主窗口连接） */
const Disconnected: FC = () => (
  <div className="disconnected">
    <Music2 size={22} />
    <div>未连接主程序</div>
    <button type="button" className="retry-btn" onClick={() => sendCmd({ t: 'snapshot:req' })}>
      重试
    </button>
  </div>
)

export default MusicWidgetApp
