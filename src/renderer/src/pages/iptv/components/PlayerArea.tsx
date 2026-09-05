import { message } from 'antd'
import { Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'

import { basename, hasResumePoint } from '../services/localMediaService'
import { iptvPlayerStore, useIptvPlayer } from '../services/playerStore'
import type { LocalPlayMode } from '../types'
import { Logo } from './Logo'
import { PlayerControls } from './PlayerControls'

interface PlayerAreaProps {
  volume: number
  muted: boolean
  maximized: boolean
  /** 正在播本地视频（file://）→ 控制条展开 VOD 功能集 */
  isLocal: boolean
  playbackRate: number
  playMode: LocalPlayMode
  onVolume: (v: number) => void
  onToggleMute: () => void
  onToggleMaximize: () => void
  onSeek: (sec: number) => void
  onRate: (rate: number) => void
  onCycleMode: () => void
  onPrev: () => void
  onNext: () => void
  /** 拖入/选择本地视频（已过滤出路径，含非视频时由页面提示） */
  onFilesDropped: (paths: string[]) => void
  /** 本地视频播放进度节流回调（页面负责写断点） */
  onProgress?: (currentTime: number, duration: number) => void
}

/** 引擎类型徽标文案 */
const engineLabel = (t: 'hls' | 'mpegts' | 'native') => (t === 'hls' ? 'HLS' : t === 'mpegts' ? 'TS' : 'MP4')

const VOLUME_MAX = 200
const WHEEL_STEP = 10 // 每格滚轮 ±10（0-200 全程 20 格，与 YouTube 0-100×5 手感一致）
const OSD_HIDE_MS = 900
const PROGRESS_SAVE_MS = 3000 // 断点落盘节流

/**
 * 播放器（剧院式布局）：
 * - 视频区 flex:1 吃满剩余高度，video object-fit:contain 信箱化 → 任意窗口比例下都与左栏精确对齐
 * - 信息条 + 控制条固定底部，永不随内容滚动消失
 * - 双击视频区 = 全屏/退出全屏；滚轮 = 调音量（带 OSD 反馈）
 * - 本地视频增强：拖文件入窗自动播放、90° 顺时针旋转、截图、画中画
 */
export const PlayerArea = ({
  volume,
  muted,
  maximized,
  isLocal,
  playbackRate,
  playMode,
  onVolume,
  onToggleMute,
  onToggleMaximize,
  onSeek,
  onRate,
  onCycleMode,
  onPrev,
  onNext,
  onFilesDropped,
  onProgress
}: PlayerAreaProps) => {
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

  // ---------------- 播放进度（进度条/时间显示 + 断点节流上报） ----------------
  const [progress, setProgress] = useState({ time: 0, duration: 0 })
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress
  const lastSaveRef = useRef(0)

  useEffect(() => {
    const v = iptvPlayerStore.video
    const onTime = () => {
      const duration = Number.isFinite(v.duration) ? v.duration : 0
      setProgress({ time: v.currentTime, duration })
      const now = Date.now()
      // 播放中每 3 秒存一次断点（有有效时长、超过 5s、未临近片尾）；看完的视频下次从头播
      if (duration > 0 && hasResumePoint(v.currentTime, duration) && now - lastSaveRef.current > PROGRESS_SAVE_MS) {
        lastSaveRef.current = now
        onProgressRef.current?.(v.currentTime, duration)
      }
    }
    const onMeta = () => {
      setProgress({ time: v.currentTime, duration: Number.isFinite(v.duration) ? v.duration : 0 })
      lastSaveRef.current = Date.now()
    }
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('durationchange', onMeta)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('durationchange', onMeta)
    }
  }, [])

  // ---------------- 画面旋转（0/90/180/270，顺时针每按一次 90°；换片自动复位） ----------------
  const [rotation, setRotation] = useState(0)
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const currentUrl = state.current?.url ?? ''

  useEffect(() => setRotation(0), [currentUrl])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setStageSize({ w: r.width, h: r.height })
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // 90°/270° 时把整个视频盒子旋转后等比缩放回舞台内（宽高互换的适配方）
  useEffect(() => {
    const v = iptvPlayerStore.video
    if (rotation % 360 === 0) {
      v.style.transform = ''
      return
    }
    const { w, h } = stageSize
    const scale = rotation % 180 === 0 || w <= 0 || h <= 0 ? 1 : Math.min(h / w, w / h)
    v.style.transformOrigin = 'center center'
    v.style.transform = `rotate(${rotation}deg) scale(${scale})`
  }, [rotation, stageSize])

  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), [])

  // ---------------- 拖拽文件入窗（悬停高亮 + 松手交给页面去重入库并起播） ----------------
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const onFilesDroppedRef = useRef(onFilesDropped)
  onFilesDroppedRef.current = onFilesDropped

  const onDragEnter = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    dragDepth.current += 1
    setDragOver(true)
  }
  const onDragOver = (e: React.DragEvent) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
  }
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    const paths = [...e.dataTransfer.files].map((f) => window.api.file.getPathForFile(f)).filter(Boolean)
    if (paths.length > 0) onFilesDroppedRef.current(paths)
  }

  // ---------------- 截图 / 画中画（直接操作单例 video 元素） ----------------
  const onSnapshot = useCallback(() => {
    const v = iptvPlayerStore.video
    if (!v.videoWidth || !v.videoHeight) {
      message.warning('还没有可截图的画面')
      return
    }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no 2d context')
      ctx.drawImage(v, 0, 0)
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      // 文件名取 store 内当前名称（快照读取，回调保持零依赖）
      a.download = `${basename(iptvPlayerStore.getSnapshot().current?.name ?? '视频截图')}-${Date.now()}.png`
      a.click()
    } catch {
      message.error('截图失败：画面受保护或尚未加载')
    }
  }, [])

  const onPip = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await iptvPlayerStore.video.requestPictureInPicture()
      }
    } catch {
      message.warning('当前状态无法开启画中画')
    }
  }, [])

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
    <Root ref={rootRef}>
      <Stage
        ref={stageRef}
        $dragOver={dragOver}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDoubleClick={toggleFullscreen}>
        {state.status === 'playing' && !isLocal && (
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

        {dragOver && <DropHint>松开鼠标，添加视频并播放</DropHint>}

        {state.status === 'idle' && (
          <Overlay>
            <BigState>从右侧列表选择频道或视频，开始观看</BigState>
          </Overlay>
        )}
        {state.status === 'connecting' && (
          <Overlay>
            <SpinnerRing />
            <BigState>
              {isLocal
                ? '正在打开视频…'
                : state.retry.attempt > 0
                  ? `信号中断 · ${state.retry.waitMs / 1000}s 后自动重连（${state.retry.attempt}/3）`
                  : '正在连接信号…'}
            </BigState>
          </Overlay>
        )}
        {state.status === 'failed' && (
          <Overlay>
            <BigState $error>{state.errorMsg || '播放失败'}</BigState>
            {isLocal && <BigState>该文件可能已移动/删除，或编码不受支持</BigState>}
          </Overlay>
        )}
      </Stage>

      <InfoBar>
        {state.current ? (
          <>
            <Logo name={state.current.name} logo={state.current.logo} size={30} />
            <ChannelName title={state.current.name}>{state.current.name}</ChannelName>
            {state.current.group && !isLocal && <GroupTag>{state.current.group}</GroupTag>}
            <EngineTag>{isLocal ? '本地' : engineLabel(state.engineType)}</EngineTag>
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
        isLocal={isLocal}
        currentTime={progress.time}
        duration={progress.duration}
        playbackRate={playbackRate}
        playMode={playMode}
        rotation={rotation}
        onToggle={() => iptvPlayerStore.toggle()}
        onVolume={onVolume}
        onToggleMute={onToggleMute}
        onFullscreen={toggleFullscreen}
        onToggleMaximize={onToggleMaximize}
        onRetry={() => iptvPlayerStore.retryNow()}
        onSeek={onSeek}
        onRate={onRate}
        onCycleMode={onCycleMode}
        onPrev={onPrev}
        onNext={onNext}
        onRotate={rotate}
        onSnapshot={onSnapshot}
        onPip={() => void onPip()}
      />
    </Root>
  )
}

/* ---------------- 剧院暗色面（视频区永远是暗色，与主题无关） ---------------- */

/** 满版平铺：无圆角无阴影，与左右栏齐平拼接（知识库式满版布局） */
const Root = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #15171c;
`

/** 视频舞台：吃满剩余高度；video 信箱化适配任意窗口比例（比例修复核心） */
const Stage = styled.div<{ $dragOver?: boolean }>`
  position: relative;
  flex: 1;
  min-height: 0;
  background: #000;
  outline: ${(p) => (p.$dragOver ? '2px dashed var(--color-primary)' : 'none')};
  outline-offset: -2px;

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

/** 拖拽悬停提示：舞台中央的半透明引导条 */
const DropHint = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
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
