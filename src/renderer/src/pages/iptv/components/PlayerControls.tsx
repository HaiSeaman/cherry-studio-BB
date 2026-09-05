import { Dropdown, Slider } from 'antd'
import {
  Camera,
  Maximize,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  Repeat,
  Repeat1,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react'
import { type FC, useState } from 'react'
import styled from 'styled-components'

import { formatTime } from '../services/localMediaService'
import type { PlayerState } from '../services/playerStore'
import type { LocalPlayMode } from '../types'

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

const MODE_META: Record<LocalPlayMode, { icon: typeof Repeat; label: string }> = {
  order: { icon: Repeat, label: '顺序播放' },
  loopOne: { icon: Repeat1, label: '单曲循环' },
  shuffle: { icon: Shuffle, label: '随机播放' }
}

interface PlayerControlsProps {
  state: PlayerState
  volume: number
  muted: boolean
  maximized: boolean
  /** 正在播本地视频（file://）：显示进度条/上下曲/倍速/模式/旋转/截图等 VOD 控件 */
  isLocal: boolean
  currentTime: number
  duration: number
  playbackRate: number
  playMode: LocalPlayMode
  rotation: number
  onToggle: () => void
  onVolume: (v: number) => void
  onToggleMute: () => void
  onFullscreen: () => void
  onToggleMaximize: () => void
  onRetry: () => void
  onSeek: (sec: number) => void
  onRate: (rate: number) => void
  onCycleMode: () => void
  onPrev: () => void
  onNext: () => void
  onRotate: () => void
  onSnapshot: () => void
  onPip: () => void
}

/** 控制条（剧院暗色面，腾讯视频式两级布局）：上进度条下功能键；直播模式自动收敛为最小控件集 */
export const PlayerControls: FC<PlayerControlsProps> = ({
  state,
  volume,
  muted,
  maximized,
  isLocal,
  currentTime,
  duration,
  playbackRate,
  playMode,
  rotation,
  onToggle,
  onVolume,
  onToggleMute,
  onFullscreen,
  onToggleMaximize,
  onRetry,
  onSeek,
  onRate,
  onCycleMode,
  onPrev,
  onNext,
  onRotate,
  onSnapshot,
  onPip
}) => {
  const playing = state.status === 'playing'
  // 防御式查表：存档数据异常时 playMode 可能是未知值，兜底回顺序播放，绝不让页面崩掉
  const modeMeta = MODE_META[playMode] ?? MODE_META.order
  const ModeIcon = modeMeta.icon
  const modeLabel = modeMeta.label

  // 拖进度条期间：滑块只跟手指（不被 timeupdate 抢回去），松手才真正 seek
  const [seekValue, setSeekValue] = useState<number | null>(null)

  return (
    <Wrap>
      {isLocal && duration > 0 && (
        <ProgressRow>
          <Slider
            className="progress-slider"
            min={0}
            max={Math.floor(duration)}
            step={1}
            value={seekValue ?? Math.min(Math.floor(currentTime), Math.floor(duration))}
            onChange={(v) => setSeekValue(Number(v))}
            onChangeComplete={(v) => {
              onSeek(Number(v))
              setSeekValue(null)
            }}
            tooltip={{ formatter: (v) => formatTime(Number(v ?? 0)) }}
          />
        </ProgressRow>
      )}

      <Bar>
        {isLocal && (
          <Ctl onClick={onPrev} aria-label="上一个视频" title="上一个">
            <SkipBack size={16} />
          </Ctl>
        )}

        <Ctl onClick={onToggle} aria-label="播放/暂停" title={playing ? '暂停（空格）' : '播放（空格）'}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </Ctl>

        {isLocal && (
          <Ctl onClick={onNext} aria-label="下一个视频" title="下一个">
            <SkipForward size={16} />
          </Ctl>
        )}

        <VolumeGroup $boost={volume > 100}>
          <Ctl onClick={onToggleMute} aria-label="静音" title="静音">
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </Ctl>
          <Slider
            value={muted ? 0 : volume}
            onChange={onVolume}
            min={0}
            max={200}
            tooltip={{ formatter: (v) => `${v ?? 0}%${(v ?? 0) > 100 ? ' 增益' : ''}` }}
          />
        </VolumeGroup>

        {state.status === 'failed' && (
          <RetryBtn onClick={onRetry} aria-label="重试">
            <RefreshCw size={13} />
            重试
          </RetryBtn>
        )}

        <Spacer />

        {isLocal && (
          <TimeText>
            {formatTime(currentTime)} <Sep>/</Sep> {duration > 0 ? formatTime(duration) : '--:--'}
          </TimeText>
        )}

        {isLocal && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: RATE_OPTIONS.map((r) => ({
                key: String(r),
                label: r === 1 ? '1.0x 正常' : `${r}x`
              })),
              selectable: true,
              selectedKeys: [String(playbackRate)],
              onClick: ({ key }) => onRate(Number(key)),
              style: { minHeight: 0 }
            }}>
            <RateBtn aria-label="播放速度" title="播放速度">
              {playbackRate === 1 ? '倍速' : `${playbackRate}x`}
            </RateBtn>
          </Dropdown>
        )}

        {isLocal && (
          <Ctl onClick={onCycleMode} aria-label={modeLabel} title={`播放模式：${modeLabel}（点击切换）`}>
            <ModeIcon size={16} />
          </Ctl>
        )}

        {isLocal && (
          <Ctl onClick={onRotate} aria-label="旋转画面" title={`顺时针旋转 90°（当前 ${rotation}°）`}>
            <RotateCw size={16} />
          </Ctl>
        )}

        {isLocal && (
          <Ctl onClick={onSnapshot} aria-label="截图" title="截图（保存原始画面）">
            <Camera size={16} />
          </Ctl>
        )}

        <Ctl onClick={onPip} aria-label="画中画" title="画中画">
          <PictureInPicture2 size={15} />
        </Ctl>

        {!isLocal && (
          <ChannelState>
            {state.status === 'connecting' ? '连接中' : state.status === 'failed' ? '已断开' : ''}
          </ChannelState>
        )}

        <Ctl
          onClick={onToggleMaximize}
          aria-label={maximized ? '还原播放器' : '页面内最大化'}
          title={maximized ? '还原播放器' : '页面内最大化'}>
          {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </Ctl>

        <Ctl onClick={onFullscreen} aria-label="全屏" title="全屏">
          <Maximize size={15} />
        </Ctl>
      </Bar>
    </Wrap>
  )
}

const Wrap = styled.div`
  flex: none;
  display: flex;
  flex-direction: column;
  background: #15171c;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
`

/** 进度条行：通栏，贴住播放器底边（腾讯视频式） */
const ProgressRow = styled.div`
  display: flex;
  align-items: center;
  padding: 2px 10px 0;

  .progress-slider.ant-slider {
    flex: 1;
    margin: 0 0 2px;
  }
  .progress-slider .ant-slider-rail {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.16);
  }
  .progress-slider .ant-slider-track {
    height: 4px;
    border-radius: 2px;
    background: var(--color-primary);
  }
  .progress-slider .ant-slider-handle::after {
    background: #fff !important;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.35) !important;
  }
`

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 5px 10px;
`

const Ctl = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.82);
  transition:
    background 0.15s,
    color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
`

const VolumeGroup = styled.div<{ $boost?: boolean }>`
  display: flex;
  align-items: center;

  /* antd Slider 暗色覆盖；>100% 增益段轨道转琥珀色提示"已放大" */
  .ant-slider {
    width: 92px;
    margin: 0 8px 0 4px;
  }
  .ant-slider-rail {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.16);
  }
  .ant-slider-track {
    height: 4px;
    border-radius: 2px;
    background: ${(p) => (p.$boost ? '#f5a623' : 'var(--color-primary)')};
  }
  .ant-slider-handle::after {
    background: #fff !important;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.35) !important;
  }
`

const RetryBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 7px;
  background: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`

const Spacer = styled.div`
  flex: 1;
`

const TimeText = styled.span`
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
  margin-right: 8px;
  white-space: nowrap;
`

const Sep = styled.span`
  color: rgba(255, 255, 255, 0.35);
  margin: 0 2px;
`

const RateBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  padding: 0 9px;
  border: none;
  border-radius: 7px;
  background: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
`

const ChannelState = styled.span`
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.4);
  margin-right: 6px;
`
