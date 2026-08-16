import { ListMusic, Pause, Play, Repeat1, Shuffle, SkipBack, SkipForward, Star } from 'lucide-react'
import { type FC, useState } from 'react'
import styled from 'styled-components'

import { formatTime, toFileUrl } from '../services/playLogic'
import type { MusicTrack, PlayMode } from '../types'
import VolumeControl from './VolumeControl'

const PLACEHOLDER_COVER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
  )

const MODE_META: Record<PlayMode, { icon: React.ReactNode; label: string }> = {
  sequential: { icon: <ListMusic size={14} />, label: '顺序播放' },
  shuffle: { icon: <Shuffle size={14} />, label: '随机播放' },
  single: { icon: <Repeat1 size={14} />, label: '单曲循环' }
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

/** 底部控制条：三栏 Grid（左封面信息 ｜ 中收藏过滤+主控+进度 ｜ 右音量），窄屏单栏重排 */
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

  return (
    <Controls>
      <NowPlaying>
        <CoverWrap>
          <Placeholder src={PLACEHOLDER_COVER} alt="" />
          {track && (track.thumbPath || track.coverPath) && (
            <Cover
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
        </CoverWrap>
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
          <Artist>{track ? track.artist || '—' : '—'}</Artist>
        </Info>
      </NowPlaying>

      <Center>
        <Buttons>
          <FilterBtn $active={favoritesActive} onClick={onToggleFavorites} aria-pressed={favoritesActive} title="收藏夹模式">
            ★ 收藏夹
          </FilterBtn>
          <Btn onClick={onPrev} title="上一首">
            <SkipBack size={16} />
          </Btn>
          <MainBtn onClick={onToggle} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </MainBtn>
          <Btn onClick={onNext} title="下一首">
            <SkipForward size={16} />
          </Btn>
          <Btn onClick={onToggleMode} title={MODE_META[playMode].label}>
            {MODE_META[playMode].icon}
          </Btn>
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
                const v = Number((e.target as HTMLInputElement).value)
                onSeekingChange(true)
                setSeekPreview(v)
              }}
              onMouseUp={(e) => {
                const v = Number((e.target as HTMLInputElement).value)
                if (duration > 0) onSeek((v / 100) * duration)
                onSeekingChange(false)
                setSeekPreview(null)
                e.currentTarget.blur()
              }}
              onTouchEnd={(e) => {
                const v = Number((e.target as HTMLInputElement).value)
                if (duration > 0) onSeek((v / 100) * duration)
                onSeekingChange(false)
                setSeekPreview(null)
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
    </Controls>
  )
}

const Controls = styled.div`
  display: grid;
  grid-template-columns: minmax(140px, 1fr) auto minmax(140px, 1fr);
  gap: 12px;
  align-items: center;
  margin-top: 10px;
  padding: 12px 14px 4px;
  border-top: 1px solid var(--color-border);
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
  gap: 10px;
  min-width: 0;
`

const CoverWrap = styled.div`
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
`

const Placeholder = styled.img`
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 10px;
`

const Cover = styled.img`
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.25s;
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
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const FavStar = styled.button`
  display: flex;
  align-items: center;
  border: none;
  background: none;
  color: var(--color-text-3);
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
  &:hover {
    color: #f5a623;
  }
  &.favorited {
    color: #f5a623;
  }
`

const Artist = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Center = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 280px;
  max-width: 480px;
`

const Buttons = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const FilterBtn = styled.button<{ $active: boolean }>`
  border: 1px solid var(--color-border);
  background: ${(p) => (p.$active ? 'var(--color-primary-mute)' : 'var(--color-background)')};
  color: ${(p) => (p.$active ? 'var(--color-primary)' : 'var(--color-text-2)')};
  border-radius: 12px;
  font-size: 11px;
  padding: 3px 10px;
  cursor: pointer;
  margin-right: 6px;
`

const Btn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-background);
  color: var(--color-icon);
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
`

const MainBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 60%, #0066cc));
  box-shadow: 0 4px 14px color-mix(in srgb, var(--color-primary) 40%, transparent);
  &:hover {
    filter: brightness(1.1);
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
  color: var(--color-text-3);
  flex-shrink: 0;
  min-width: 34px;
  &:last-child {
    text-align: right;
  }
`

const ProgressTrack = styled.div`
  position: relative;
  flex: 1;
  height: 14px;
  display: flex;
  align-items: center;
  background: var(--color-border-soft);
  border-radius: 2px;
  cursor: pointer;

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

  &:hover .thumb {
    opacity: 1;
  }
`

const ProgressFill = styled.div`
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 4px;
  width: 0;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 50%, #0066cc));
  pointer-events: none;
`

const ProgressThumb = styled.div.attrs({ className: 'thumb' })`
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--color-primary);
  opacity: 0;
  pointer-events: none;
`

const Right = styled.div.attrs({ className: 'right' })`
  display: flex;
  justify-content: flex-end;
  align-items: center;
`

export default PlayerControls
