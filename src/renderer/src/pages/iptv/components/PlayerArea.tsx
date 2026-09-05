import { Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import styled, { css } from 'styled-components'

import { iptvPlayerStore, useIptvPlayer } from '../services/playerStore'
import { Logo } from './Logo'
import { PlayerControls } from './PlayerControls'

interface PlayerAreaProps {
  volume: number
  muted: boolean
  maximized: boolean
  onVolume: (v: number) => void
  onToggleMute: () => void
  onToggleMaximize: () => void
}

/** 引擎类型徽标文案 */
const engineLabel = (t: 'hls' | 'mpegts' | 'native') => (t === 'hls' ? 'HLS' : t === 'mpegts' ? 'TS' : 'MP4')

const VOLUME_MAX = 200
const WHEEL_STEP = 10 // 每格滚轮 ±10（0-200 全程 20 格，与 YouTube 0-100×5 手感一致）
const OSD_HIDE_MS = 900

/**
 * 播放器（剧院式布局）：
 * - 视频区 flex:1 吃满剩余高度，video object-fit:contain 信箱化 → 任意窗口比例下都与左栏精确对齐
 * - 信息条 + 控制条固定底部，永不随内容滚动消失
 * - 双击视频区 = 全屏/退出全屏；滚轮 = 调音量（带 OSD 反馈）
 */
export const PlayerArea = ({ volume, muted, maximized, onVolume, onToggleMute, onToggleMaximize }: PlayerAreaProps) => {
  const state = useIptvPlayer()
  const stageRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // ---------------- 音量 OSD（滚轮调节的瞬时反馈） ----------------
  const [volumeOSD, setVolumeOSD] = useState<number | null>(null)
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showOSD = useCallback((v: number) => {
    setVolumeOSD(v)
    if (osdTimer.current) clearTimeout(osdTimer.current)
    osdTimer.current = setTimeout(() => setVolumeOSD(null), OSD_HIDE_MS)
  }, [])
  useEffect(
    () => () => {
      if (osdTimer.current) clearTimeout(osdTimer.current)
    },
    []
  )

  // ---------------- 滚轮调音量 ----------------
  // 最新值经 ref 读取（避免依赖 props 重绑监听）；本地先行更新，防同帧连滚丢步进
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const onVolumeRef = useRef(onVolume)
  onVolumeRef.current = onVolume

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const step = e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP
      const next = Math.min(Math.max(volumeRef.current + step, 0), VOLUME_MAX)
      if (next !== volumeRef.current) {
        volumeRef.current = next
        onVolumeRef.current(next)
      }
      showOSD(next) // 到边界也刷新 OSD，让用户知道已到顶
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [showOSD])

  // 单例 video 元素挂到 DOM（卸载时移回文档外，引擎状态保留）
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.appendChild(iptvPlayerStore.video)
    return () => {
      if (iptvPlayerStore.video.parentElement === stage) stage.removeChild(iptvPlayerStore.video)
    }
  }, [])

  const toggleFullscreen = () => {
    const el = rootRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen().catch(() => {})
  }

  return (
    <Root ref={rootRef} $maximized={maximized}>
      <Stage ref={stageRef} onDoubleClick={toggleFullscreen}>
        {state.status === 'playing' && (
          <LiveBadge>
            <LiveDot />
            LIVE
          </LiveBadge>
        )}

        {volumeOSD !== null && (
          <VolumeOSD $boost={volumeOSD > 100}>
            {volumeOSD === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{volumeOSD}%</span>
          </VolumeOSD>
        )}

        {state.status === 'idle' && (
          <Overlay>
            <BigState>从右侧播放列表选择频道，开始观看</BigState>
          </Overlay>
        )}
        {state.status === 'connecting' && (
          <Overlay>
            <SpinnerRing />
            <BigState>
              {state.retry.attempt > 0
                ? `信号中断 · ${state.retry.waitMs / 1000}s 后自动重连（${state.retry.attempt}/3）`
                : '正在连接信号…'}
            </BigState>
          </Overlay>
        )}
        {state.status === 'failed' && (
          <Overlay>
            <BigState $error>{state.errorMsg || '播放失败'}</BigState>
          </Overlay>
        )}
      </Stage>

      <InfoBar>
        {state.current ? (
          <>
            <Logo name={state.current.name} logo={state.current.logo} size={30} />
            <ChannelName title={state.current.name}>{state.current.name}</ChannelName>
            {state.current.group && <GroupTag>{state.current.group}</GroupTag>}
            <EngineTag>{engineLabel(state.engineType)}</EngineTag>
          </>
        ) : (
          <ChannelName $muted>未在播放</ChannelName>
        )}
      </InfoBar>

      <PlayerControls
        state={state}
        volume={volume}
        muted={muted}
        maximized={maximized}
        onToggle={() => iptvPlayerStore.toggle()}
        onVolume={onVolume}
        onToggleMute={onToggleMute}
        onFullscreen={toggleFullscreen}
        onToggleMaximize={onToggleMaximize}
        onRetry={() => iptvPlayerStore.retryNow()}
      />
    </Root>
  )
}

/* ---------------- 剧院暗色面（视频区永远是暗色，与主题无关） ---------------- */

const Root = styled.div<{ $maximized?: boolean }>`
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #15171c;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.05);

  /* 页面内最大化：去掉悬浮卡圆角，铺满内容区 */
  ${(p) =>
    p.$maximized &&
    css`
      border-radius: 0;
      box-shadow: none;
    `}

  &:fullscreen {
    border-radius: 0;
    box-shadow: none;
  }
`

/** 视频舞台：吃满剩余高度；video 信箱化适配任意窗口比例（比例修复核心） */
const Stage = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  background: #000;

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain; /* 信箱化：16:9 流在更宽/更高的容器里自动留黑边，不再撑破布局 */
  }
`

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  pointer-events: none;
  animation: fadein 0.25s ease;

  @keyframes fadein {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`

const BigState = styled.div<{ $error?: boolean }>`
  font-size: 13.5px;
  letter-spacing: 0.05em;
  color: ${(p) => (p.$error ? '#ff8589' : 'rgba(255, 255, 255, 0.78)')};
`

const SpinnerRing = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.14);
  border-top-color: rgba(255, 255, 255, 0.85);
  animation: spin 0.9s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`

const LiveBadge = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  color: #ff5a5f;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  pointer-events: none;
`

/** 音量 OSD：滚轮调节时右上角瞬时反馈；>100% 增益态用暖色提示 */
const VolumeOSD = styled.div<{ $boost?: boolean }>`
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  animation: osdpop 0.18s ease;

  span {
    color: ${(p) => (p.$boost ? '#ffd166' : '#fff')};
  }

  @keyframes osdpop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`

const LiveDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff5a5f;
  animation: livepulse 1.6s ease-in-out infinite;

  @keyframes livepulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(0.72);
    }
  }
`

/* ---------------- 底部信息条 ---------------- */

const InfoBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 7px 14px;
  background: #191c22;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
`

const ChannelName = styled.span<{ $muted?: boolean }>`
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: ${(p) => (p.$muted ? 'rgba(255,255,255,0.35)' : '#e8eaed')};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const GroupTag = styled.span`
  flex: none;
  font-size: 11px;
  color: #9aa0a8;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 5px;
  padding: 2px 8px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const EngineTag = styled.span`
  flex: none;
  margin-left: auto;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #7d8590;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  padding: 1px 6px;
`
