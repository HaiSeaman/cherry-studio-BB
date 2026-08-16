import { type FC, useRef } from 'react'
import styled from 'styled-components'

import { toFileUrl } from '../services/playLogic'
import type { MusicTrack } from '../types'
import { Eq, mx } from './mx'

const COVER_FALLBACK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#98A79F" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
  )

interface PlaylistProps {
  tracks: MusicTrack[]
  currentId: number | null
  isPlaying: boolean
  dragEnabled: boolean
  onPlay: (track: MusicTrack) => void
  onToggleFavorite: (track: MusicTrack) => void
  onDelete: (track: MusicTrack) => void
  onReorder: (orderedIds: number[]) => void
}

/** 播放列表：封面缩略图两级回退、播放行频谱高亮、悬停 ★/✕、拖拽排序（过滤状态下禁用） */
const Playlist: FC<PlaylistProps> = ({
  tracks,
  currentId,
  isPlaying,
  dragEnabled,
  onPlay,
  onToggleFavorite,
  onDelete,
  onReorder
}) => {
  const dragSrcId = useRef<number | null>(null)

  const handleDrop = (e: React.DragEvent, targetId: number | null) => {
    e.preventDefault()
    const srcId = dragSrcId.current
    dragSrcId.current = null
    if (srcId == null || targetId == null || srcId === targetId) return
    const ids = tracks.map((t) => t.id!)
    const from = ids.indexOf(srcId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    onReorder(ids)
  }

  return (
    <List role="listbox">
      {tracks.map((t) => {
        const playing = t.id === currentId
        return (
          <Item
            key={t.id}
            className={playing ? 'playing' : ''}
            draggable={dragEnabled}
            data-no-dnd
            onClick={() => onPlay(t)}
            onDragStart={(e) => {
              dragSrcId.current = t.id ?? null
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(t.id ?? ''))
            }}
            onDragOver={(e) => dragEnabled && e.preventDefault()}
            onDrop={(e) => dragEnabled && handleDrop(e, t.id ?? null)}>
            <Cover
              loading="lazy"
              decoding="async"
              src={t.thumbPath || t.coverPath ? toFileUrl(t.thumbPath || t.coverPath) : COVER_FALLBACK}
              onError={(e) => {
                const img = e.currentTarget
                if (t.coverPath && !img.dataset.fb1) {
                  img.dataset.fb1 = '1'
                  img.src = toFileUrl(t.coverPath)
                } else if (!img.dataset.fb2) {
                  img.dataset.fb2 = '1'
                  img.src = COVER_FALLBACK
                }
              }}
            />
            <Info>
              <Title className="title">{t.title}</Title>
              <Meta>{[t.artist, t.album].filter(Boolean).join(' · ') || '未知艺术家'}</Meta>
            </Info>
            <Duration>
              {playing ? <Eq paused={!isPlaying} /> : t.duration > 0 ? formatDuration(t.duration) : ''}
            </Duration>
            <FavBtn
              className={t.favorite === 1 ? 'favorited' : ''}
              title={t.favorite === 1 ? '取消收藏' : '收藏'}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(t)
              }}>
              {t.favorite === 1 ? '★' : '☆'}
            </FavBtn>
            <DeleteBtn
              title="从列表移除"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(t)
              }}>
              ✕
            </DeleteBtn>
          </Item>
        )
      })}
    </List>
  )
}

function formatDuration(sec: number): string {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
`

const Item = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 56px 6px 8px;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
  &:hover {
    background: ${mx.soft};
  }
  &.playing {
    background: ${mx.accentSoft};
    .title {
      color: ${mx.accent};
      font-weight: 600;
    }
  }
`

const Cover = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: ${mx.soft2};
  border: 1px solid ${mx.border};
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const Title = styled.div`
  font-size: 13px;
  color: ${mx.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Meta = styled.div`
  font-size: 11px;
  color: ${mx.text3};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 1px;
`

const Duration = styled.span`
  font-size: 11px;
  color: ${mx.text3};
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  min-width: 34px;
  display: inline-flex;
  justify-content: flex-end;
`

const FavBtn = styled.button`
  position: absolute;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: ${mx.text3};
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transition: all 0.15s ease;
  ${Item}:hover & {
    opacity: 1;
    pointer-events: auto;
  }
  &.favorited {
    opacity: 1;
    pointer-events: auto;
    color: ${mx.amber};
  }
  &:hover {
    transform: translateY(-50%) scale(1.15);
  }
`

const DeleteBtn = styled.button`
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: ${mx.text3};
  font-size: 12px;
  cursor: pointer;
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transition: all 0.15s ease;
  &:hover {
    color: ${mx.danger};
    background: rgba(239, 83, 80, 0.08);
  }
  ${Item}:hover & {
    opacity: 1;
    pointer-events: auto;
  }
`

export default Playlist
