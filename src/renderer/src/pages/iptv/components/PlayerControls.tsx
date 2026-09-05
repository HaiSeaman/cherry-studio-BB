import { Slider } from 'antd'
import { Maximize, Maximize2, Minimize2, Pause, Play, RefreshCw, Volume2, VolumeX } from 'lucide-react'
import type { FC } from 'react'
import styled from 'styled-components'

import type { PlayerState } from '../services/playerStore'

interface PlayerControlsProps {
  state: PlayerState
  volume: number
  muted: boolean
  maximized: boolean
  onToggle: () => void
  onVolume: (v: number) => void
  onToggleMute: () => void
  onFullscreen: () => void
  onToggleMaximize: () => void
  onRetry: () => void
}

/** 控制条（剧院暗色面）：播放/音量(0-200)/重试/页面内最大化/全屏，固定在播放器底部 */
export const PlayerControls: FC<PlayerControlsProps> = ({
  state,
  volume,
  muted,
  maximized,
  onToggle,
  onVolume,
  onToggleMute,
  onFullscreen,
  onToggleMaximize,
  onRetry
}) => (
  <Bar>
    <Ctl onClick={onToggle} aria-label="播放/暂停" title={state.status === 'playing' ? '暂停' : '播放'}>
      {state.status === 'playing' ? <Pause size={17} /> : <Play size={17} />}
    </Ctl>

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

    <ChannelState>{state.status === 'connecting' ? '连接中' : state.status === 'failed' ? '已断开' : ''}</ChannelState>

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
)

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 5px 10px;
  background: #15171c;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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

const ChannelState = styled.span`
  font-size: 11px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.4);
  margin-right: 6px;
`
