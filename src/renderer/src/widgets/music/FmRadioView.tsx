import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react'
import { type FC, useMemo } from 'react'

import type { RadioStation } from '../../pages/music/types'
import type { WidgetPlayerState } from './protocol'
import { sendCmd } from './transport'

const STATUS_TEXT: Record<string, string> = {
  idle: '未播放',
  connecting: '连接中',
  playing: '正在播放',
  paused: '已暂停',
  error: '连接失败'
}

/** 流地址 → 主机名（畸形地址容错返回原文截断） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.slice(0, 24)
  }
}

interface FmRadioViewProps {
  state: WidgetPlayerState | null
  /** 主窗口推送的自定义电台（Redux customStations） */
  stations: RadioStation[]
}

/** FM 电台视图：当前电台/状态/网速 + 模拟频谱 + 电台网格（自定义推送 + Dexie 收藏直读）+ 换台控制 */
const FmRadioView: FC<FmRadioViewProps> = ({ state, stations }) => {
  // 收藏电台直读 Dexie（同源共享）；与推送的自定义电台按 url 去重合并
  const favorites = useLiveQuery(async () => (await db.radio_favorites.toArray()) ?? [], [], [])
  const grid = useMemo(() => {
    const seen = new Set<string>()
    const out: RadioStation[] = []
    for (const s of [...stations, ...(favorites ?? [])]) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      out.push(s)
    }
    return out
  }, [stations, favorites])

  const fm = state?.fm ?? null
  const playing = state?.playing ?? false
  const volume = state?.volume ?? 80
  const VolIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  const current = grid.find((s) => s.url === fm?.url) ?? null
  const currentName = current?.name ?? (fm ? hostOf(fm.url) : '')

  // 换台在挂件侧基于网格计算目标 URL（主窗口 store 的电台列表可能与网格不同）
  const stepStation = (dir: 1 | -1) => {
    if (grid.length === 0) return
    const idx = grid.findIndex((s) => s.url === fm?.url)
    const nextIdx = idx < 0 ? 0 : (idx + dir + grid.length) % grid.length
    sendCmd({ t: 'cmd', a: 'playFm', url: grid[nextIdx].url })
  }

  return (
    <div className="fm-view">
      <div className="fm-status">
        <span className={`fm-dot ${fm?.status ?? 'idle'}`} />
        <span className="fm-name">{fm ? currentName : '选择一个电台开始收听'}</span>
        {fm && <span className="fm-state">{STATUS_TEXT[fm.status] ?? fm.status}</span>}
        {fm?.status === 'playing' && fm.kbps > 0 && <span className="fm-kbps">{fm.kbps} KB/s</span>}
        {fm?.errorMsg && <span className="fm-error">{fm.errorMsg}</span>}
      </div>

      <div className={`spectrum ${playing ? 'on' : ''}`} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="fm-grid">
        {grid.length === 0 ? (
          <div className="drawer-empty">没有可用电台，先在主程序 FM 页收藏或添加自定义电台</div>
        ) : (
          grid.map((s) => (
            <button
              type="button"
              key={s.url}
              className={`fm-chip ${s.url === fm?.url ? 'current' : ''}`}
              title={s.name}
              onClick={() => sendCmd({ t: 'cmd', a: 'playFm', url: s.url })}>
              {s.name}
            </button>
          ))
        )}
      </div>

      <div className="controls">
        <button type="button" className="ctl" title="上一台" onClick={() => stepStation(-1)}>
          <SkipBack size={15} />
        </button>
        <button
          type="button"
          className="ctl main"
          title={playing ? '暂停' : '播放'}
          onClick={() => sendCmd({ t: 'cmd', a: 'fmToggle' })}>
          {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
        </button>
        <button type="button" className="ctl" title="下一台" onClick={() => stepStation(1)}>
          <SkipForward size={15} />
        </button>
        <div className="volume">
          <button
            type="button"
            className="ctl small"
            title={volume === 0 ? '取消静音' : '静音'}
            onClick={() => sendCmd({ t: 'cmd', a: 'volume', v: volume === 0 ? 80 : 0 })}>
            <VolIcon size={13} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            aria-label="音量"
            style={{ '--vol': `${volume}%` } as React.CSSProperties}
            onChange={(e) => sendCmd({ t: 'cmd', a: 'volume', v: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  )
}

export default FmRadioView
