import { ListMusic, Music2, Pause, Play, Repeat1, Shuffle, SkipBack, SkipForward, Star } from 'lucide-react'
import { type FC, useState } from 'react'
import styled, { keyframes } from 'styled-components'

import { formatTime, toFileUrl } from '../services/playLogic'
import type { MusicTrack, PlayMode } from '../types'
import { mx, reduceMotion } from './mx'
import VolumeControl from './VolumeControl'

const MODE_META: Record<PlayMode, { icon: React.ReactNode; label: string }> = {
  sequential: { icon: <ListMusic size={16} />, label: '顺序播放' },
  shuffle: { icon: <Shuffle size={16} />, label: '随机播放' },
  single: { icon: <Repeat1 size={16} />, label: '单曲循环' }
}

interface PlayerControlsProps {
  track: MusicTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  playMode: PlayMode
  favoritesActive: boolean
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onSeek: (time: number) => void
  onSeekingChange: (seeking: boolean) => void
  onToggleMode: () => void
  onToggleFavorites: () => void
  onToggleFavoriteTrack: (track: MusicTrack) => void
}

/** 底部「播放舱」：旋转唱片封面（播放中缓转+呼吸光晕）+ 主控按钮 + 渐变进度条 + 音量 */
const PlayerControls: FC<PlayerControlsProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  playMode,
  favoritesActive,
  onToggle,
  onPrev,
  onNext,
  onSeek,
  onSeekingChange,
  onToggleMode,
  onToggleFavorites,
  onToggleFavoriteTrack
}) => {
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const shownTime = seekPreview != null && duration > 0 ? (seekPreview / 100) * duration : currentTime
  const pct = duration > 0 ? ((seekPreview != null ? (seekPreview / 100) * duration : currentTime) / duration) * 100 : 0

  const commitSeek = (raw: number) => {
    if (duration > 0) onSeek((raw / 100) * duration)
    onSeekingChange(false)
    setSeekPreview(null)
  }

  return (
    <Dock>
      <NowPlaying>
        <DiscWrap className={isPlaying ? 'spin' : ''}>
          <DiscBase>
            <Music2 size={18} />
          </DiscBase>
          {track && (track.thumbPath || track.coverPath) && (
            <DiscCover
              src={toFileUrl(track.thumbPath || track.coverPath)}
              onError={(e) => {
                const img = e.currentTarget
                if (track.coverPath && !img.dataset.fb1) {
                  img.dataset.fb1 = '1'
                  img.src = toFileUrl(track.coverPath)
                } else {
                  img.style.opacity = '0'
                }
              }}
              alt=""
            />
          )}
          <DiscHole />
        </DiscWrap>
        <Info>
          <TitleRow>
            <Title>{track?.title ?? '未播放'}</Title>
            {track && (
              <FavStar
                className={track.favorite === 1 ? 'favorited' : ''}
                onClick={() => onToggleFavoriteTrack(track)}
                title={track.favorite === 1 ? '取消收藏' : '收藏'}>
                <Star size={14} fill={track.favorite === 1 ? 'currentColor' : 'none'} />
              </FavStar>
            )}
          </TitleRow>
          <Artist>{track ? track.artist || '未知艺术家' : '从列表挑一首开始吧'}</Artist>
        </Info>
      </NowPlaying>

      <Center>
        <Buttons>
          <FilterPill
            $active={favoritesActive}
            onClick={onToggleFavorites}
            aria-pressed={favoritesActive}
            title="只在收藏中播放">
            <Star size={12} fill={favoritesActive ? 'currentColor' : 'none'} />
            收藏夹
          </FilterPill>
          <RoundBtn onClick={onPrev} title="上一首">
            <SkipBack size={16} />
          </RoundBtn>
          <MainBtn onClick={onToggle} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
          </MainBtn>
          <RoundBtn onClick={onNext} title="下一首">
            <SkipForward size={16} />
          </RoundBtn>
          <RoundBtn onClick={onToggleMode} title={MODE_META[playMode].label} $active={playMode !== 'sequential'}>
            {MODE_META[playMode].icon}
          </RoundBtn>
        </Buttons>
        <ProgressWrap>
          <Time>{formatTime(shownTime)}</Time>
          <ProgressTrack>
            <ProgressFill style={{ width: `${pct}%` }} />
            <ProgressThumb style={{ left: `${pct}%` }} />
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={pct}
              aria-label="播放进度"
              onChange={() => {}}
              onInput={(e) => {
                onSeekingChange(true)
                setSeekPreview(Number((e.target as HTMLInputElement).value))
              }}
              onMouseUp={(e) => {
                commitSeek(Number((e.target as HTMLInputElement).value))
                e.currentTarget.blur()
              }}
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                  commitSeek(Number((e.target as HTMLInputElement).value))
                }
              }}
              onTouchEnd={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
              onBlur={(e) => {
                if (seekPreview != null) commitSeek(Number((e.target as HTMLInputElement).value))
              }}
              disabled={!track || duration <= 0}
            />
          </ProgressTrack>
          <Time>{formatTime(duration)}</Time>
        </ProgressWrap>
      </Center>

      <Right>
        <VolumeControl />
      </Right>
    </Dock>
  )
}

const spinDisc = keyframes`
  to { transform: rotate(360deg); }
`
const breatheGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-primary) 30%, transparent); }
  50% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--color-primary) 0%, transparent); }
`

const Dock = styled.div`
  display: grid;
  grid-template-columns: minmax(150px, 1fr) auto minmax(130px, 1fr);
  gap: 12px;
  align-items: center;
  margin-top: 10px;
  padding: 12px 14px;
  background: ${mx.soft2};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    grid-template-areas: 'center' 'now-playing' 'right';
    gap: 8px;
    .now-playing {
      justify-content: center;
    }
    .right {
      justify-content: center;
    }
  }
`

const NowPlaying = styled.div.attrs({ className: 'now-playing' })`
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
`

const DiscWrap = styled.div`
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  &.spin {
    animation: ${spinDisc} 8s linear infinite;
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      animation: ${breatheGlow} 2.4s ease-in-out infinite;
      pointer-events: none;
    }
  }
  ${reduceMotion}
`

const DiscBase = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.85);
  background: ${mx.gradient};
`

const DiscCover = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.25s;
`

const DiscHole = styled.span`
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: ${mx.soft2};
  box-shadow: 0 0 0 3px rgba(34, 49, 42, 0.15);
  z-index: 3;
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const Title = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${mx.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const FavStar = styled.button`
  display: flex;
  align-items: center;
  border: none;
  background: none;
  color: ${mx.text3};
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
  &:hover {
    color: ${mx.amber};
  }
  &.favorited {
    color: ${mx.amber};
  }
`

const Artist = styled.div`
  font-size: 11px;
  color: ${mx.text3};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
`

const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 280px;
  max-width: 480px;
`

const Buttons = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const FilterPill = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid ${(p) => (p.$active ? mx.accent : mx.border)};
  background: ${(p) => (p.$active ? mx.accentSoft : mx.card)};
  color: ${(p) => (p.$active ? mx.accent : mx.text2)};
  border-radius: 999px;
  font-size: 11.5px;
  padding: 5px 12px;
  cursor: pointer;
  margin-right: 4px;
  transition: all 0.18s ease;
  white-space: nowrap;
  &:hover {
    border-color: ${mx.accent};
    color: ${mx.accent};
  }
`

const RoundBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid ${(p) => (p.$active ? mx.accent : mx.border)};
  background: ${mx.card};
  color: ${(p) => (p.$active ? mx.accent : mx.text2)};
  cursor: pointer;
  transition: all 0.18s ease;
  &:hover {
    border-color: ${mx.accent};
    color: ${mx.accent};
    background: ${mx.accentSoft};
    transform: translateY(-1px);
  }
`

const MainBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  background: ${mx.gradient};
  box-shadow: 0 6px 18px color-mix(in srgb, var(--color-primary) 40%, transparent);
  transition: all 0.18s ease;
  &:hover {
    transform: translateY(-1px) scale(1.04);
    box-shadow: 0 8px 22px color-mix(in srgb, var(--color-primary) 50%, transparent);
  }
  &:active {
    transform: scale(0.97);
  }
`

const ProgressWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
`

const Time = styled.span`
  font-size: 11px;
  color: ${mx.text3};
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 34px;
  &:last-child {
    text-align: right;
  }
`

const ProgressTrack = styled.div`
  position: relative;
  flex: 1;
  height: 18px;
  display: flex;
  align-items: center;
  cursor: pointer;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 6px;
    border-radius: 3px;
    background: ${mx.border};
  }

  input[type='range'] {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    opacity: 0;
    z-index: 2;
    cursor: pointer;
    &:disabled {
      cursor: default;
    }
  }

  &:hover .thumb,
  &:active .thumb {
    opacity: 1;
  }
`

const ProgressFill = styled.div`
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 6px;
  width: 0;
  border-radius: 3px;
  background: ${mx.gradient};
  pointer-events: none;
  z-index: 1;
`

const ProgressThumb = styled.div.attrs({ className: 'thumb' })`
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid ${mx.accent};
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 2;
`

const Right = styled.div.attrs({ className: 'right' })`
  display: flex;
  justify-content: flex-end;
  align-items: center;
`

export default PlayerControls
