import {
  ListMusic,
  Pause,
  Play,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Star,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import { type FC, useEffect, useRef, useState } from 'react'

import { formatTime } from '../../pages/music/services/playLogic'
import type { PlayMode } from '../../pages/music/types'
import PlaylistDrawer from './PlaylistDrawer'
import type { WidgetPlayerState } from './protocol'
import { onPosition, sendCmd } from './transport'

const MODE_META: Record<PlayMode, { icon: React.ReactNode; label: string }> = {
  sequential: { icon: <ListMusic size={13} />, label: '顺序播放' },
  shuffle: { icon: <Shuffle size={13} />, label: '随机播放' },
  single: { icon: <Repeat1 size={13} />, label: '单曲循环' }
}

interface LocalPlayerViewProps {
  state: WidgetPlayerState | null
}

/** 本地音乐视图：曲目信息 + 模拟频谱 + 进度条（ref 直更）+ 控制栏 + 歌单抽屉 */
const LocalPlayerView: FC<LocalPlayerViewProps> = ({ state }) => {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const durationRef = useRef(0)
  const dragging = useRef(false)

  // 进度直更：4/s pos 消息 + update 全量 → 直接写 DOM，不触发 React 渲染；拖动中暂停外部写入
  useEffect(
    () =>
      onPosition((p, d) => {
        if (d > 0) durationRef.current = d
        if (dragging.current) return
        const dur = d > 0 ? d : durationRef.current
        if (barRef.current) barRef.current.style.width = dur > 0 ? `${(p / dur) * 100}%` : '0%'
        if (rangeRef.current && dur > 0) rangeRef.current.value = String(Math.min(100, (p / dur) * 100))
        if (timeRef.current) timeRef.current.textContent = `${formatTime(p)} / ${formatTime(dur)}`
      }),
    []
  )

  const commitSeek = (pct: number) => {
    const dur = durationRef.current
    if (dur > 0) sendCmd({ t: 'cmd', a: 'seek', v: (pct / 100) * dur })
    dragging.current = false
  }

  const playing = state?.localPlaying ?? false
  const track = state?.track ?? null
  const isFav = track?.favorite === 1
  const favoritesActive = state?.favoritesActive ?? false
  const volume = state?.volume ?? 80
  const VolIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  return (
    <div className="local-view">
      <div className="track-info">
        <div className="track-title-row">
          <div className="track-title">{track?.title ?? '未播放'}</div>
          {track && (
            <button
              type="button"
              className={`fav-btn ${isFav ? 'on' : ''}`}
              title={isFav ? '取消收藏' : '收藏'}
              onClick={() => sendCmd({ t: 'cmd', a: 'toggleFavorite', id: track.id })}>
              <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
        <div className="track-artist">{track ? track.artist || '未知艺术家' : '打开歌单挑一首吧'}</div>
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

      <div className="progress-row">
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={100}
          step={0.5}
          defaultValue={0}
          aria-label="播放进度"
          onPointerDown={() => {
            dragging.current = true
          }}
          onChange={(e) => {
            const pct = Number(e.target.value)
            if (barRef.current) barRef.current.style.width = `${pct}%`
            if (timeRef.current && durationRef.current > 0) {
              timeRef.current.textContent = `${formatTime((pct / 100) * durationRef.current)} / ${formatTime(durationRef.current)}`
            }
          }}
          onPointerUp={(e) => commitSeek(Number(e.currentTarget.value))}
          onPointerCancel={() => {
            dragging.current = false
          }}
        />
        <div className="progress-track">
          <div ref={barRef} className="progress-fill" />
        </div>
        <span ref={timeRef} className="time-label">
          0:00 / 0:00
        </span>
      </div>

      <div className="controls">
        <button
          type="button"
          className="ctl small"
          title={state ? MODE_META[state.playMode].label : '顺序播放'}
          onClick={() => sendCmd({ t: 'cmd', a: 'togglePlayMode' })}>
          {state ? MODE_META[state.playMode].icon : <ListMusic size={13} />}
        </button>
        <button
          type="button"
          className={`ctl small ${favoritesActive ? 'active' : ''}`}
          title={favoritesActive ? '当前只播放收藏夹曲目（点击切换全部）' : '仅播放收藏夹曲目'}
          onClick={() => sendCmd({ t: 'cmd', a: 'toggleFavoritesActive' })}>
          <Star size={13} fill={favoritesActive ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="ctl" title="上一首" onClick={() => sendCmd({ t: 'cmd', a: 'prev' })}>
          <SkipBack size={15} />
        </button>
        <button
          type="button"
          className="ctl main"
          title={playing ? '暂停' : '播放'}
          onClick={() => sendCmd({ t: 'cmd', a: 'togglePlay' })}>
          {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
        </button>
        <button type="button" className="ctl" title="下一首" onClick={() => sendCmd({ t: 'cmd', a: 'next' })}>
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
        <button type="button" className="ctl small" title="歌单" onClick={() => setDrawerOpen(true)}>
          <ListMusic size={14} />
        </button>
      </div>

      {drawerOpen && (
        <PlaylistDrawer
          currentId={track?.id ?? null}
          favoritesActive={favoritesActive}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

export default LocalPlayerView
