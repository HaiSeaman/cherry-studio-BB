import { ExternalLink, Lock, Minus, Music2, Pin, PinOff, Radio, Unlock, X } from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'

import type { RadioStation } from '../../pages/music/types'
import FmRadioView from './FmRadioView'
import LocalPlayerView from './LocalPlayerView'
import type { WidgetPlayerState } from './protocol'
import { emitPosition, onHostMessage, sendCmd } from './transport'

type View = 'local' | 'fm'

const VIEW_STORAGE_KEY = 'musicWidgetView'

/**
 * 桌面音乐播放挂件（轻量独立入口，无 antd/Redux/router）。
 * 纯遥控器：零音频实例，全部播放命令经主进程中转 IPC 发往主窗口 playerStore；
 * 曲库/电台收藏直读 Dexie；进度条 4/s 经 ref 直更 DOM。
 * 已移除贴边吸附/折叠，保留：置顶/锁定/拖拽/拉伸（原生能力）。
 */
const MusicWidgetApp: FC = () => {
  const [pinned, setPinned] = useState(true)
  const [locked, setLocked] = useState(false)
  const [state, setState] = useState<WidgetPlayerState | null>(null)
  const [connected, setConnected] = useState(false)
  const [stations, setStations] = useState<RadioStation[]>([])
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(VIEW_STORAGE_KEY) === 'fm' ? 'fm' : 'local'
  )
  const snapshotTimer = useRef<number>(0)

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

  const switchView = (v: View) => {
    setView(v)
    localStorage.setItem(VIEW_STORAGE_KEY, v)
  }

  return (
    <div className="app">
      <header className={`header ${locked ? 'locked' : ''}`}>
        <span className="title">
          <Music2 size={12} className="title-icon" /> 桌面音乐
        </span>
        <div className="btns">
          <button
            type="button"
            title={view === 'local' ? '切换到 FM 电台' : '切换到本地音乐'}
            className="mode-btn"
            onClick={() => switchView(view === 'local' ? 'fm' : 'local')}>
            {view === 'local' ? <Radio size={13} /> : <Music2 size={13} />}
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
          <button type="button" title="关闭" className="close" onClick={() => void window.api.musicWidget.close()}>
            <X size={14} />
          </button>
        </div>
      </header>

      <main className="body">
        {!connected ? (
          <div className="disconnected">
            <Music2 size={22} />
            <div>未连接主程序</div>
            <button type="button" className="retry-btn" onClick={() => sendCmd({ t: 'snapshot:req' })}>
              重试
            </button>
          </div>
        ) : view === 'local' ? (
          <LocalPlayerView state={state} />
        ) : (
          <FmRadioView state={state} stations={stations} />
        )}
      </main>
    </div>
  )
}

export default MusicWidgetApp
