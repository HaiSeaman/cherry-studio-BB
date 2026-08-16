import { type FC, useRef } from 'react'
import styled from 'styled-components'

import { toFileUrl } from '../services/playLogic'
import type { MusicTrack } from '../types'

const COVER_FALLBACK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
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

/** 播放列表：封面缩略图两级回退、播放高亮、hover ★/✕、HTML5 拖拽排序（过滤状态下禁用） */
const Playlist: FC<PlaylistProps> = ({ tracks, currentId, isPlaying, dragEnabled, onPlay, onToggleFavorite, onDelete, onReorder }) => {
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
            className={`${playing ? 'playing' : ''} ${playing && isPlaying ? 'pulse' : ''}`}
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
              <Meta>{[t.artist, t.album].filter(Boolean).join(' · ') || '—'}</Meta>
            </Info>
            <Duration>{t.duration > 0 ? formatDuration(t.duration) : ''}</Duration>
            <FavBtn
              className={t.favorite === 1 ? 'favorited' : ''}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(t)
              }}>
              {t.favorite === 1 ? '★' : '☆'}
            </FavBtn>
            <DeleteBtn
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
`

const Item = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 58px 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  &:hover {
    background: var(--color-background-mute);
  }
  &.playing {
    background: var(--color-primary-mute);
    .title {
      color: var(--color-primary);
    }
  }
`

const Cover = styled.img`
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-background-mute);
`

const Info = styled.div`
  flex: 1;
  min-width: 0;
`

const Title = styled.div`
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Meta = styled.div`
  font-size: 11px;
  color: var(--color-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Duration = styled.span`
  font-size: 11px;
  color: var(--color-text-3);
  flex-shrink: 0;
  min-width: 32px;
  text-align: right;
`

const FavBtn = styled.button`
  position: absolute;
  right: 30px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--color-text-3);
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  ${Item}:hover & {
    opacity: 1;
    pointer-events: auto;
  }
  &.favorited {
    opacity: 1;
    pointer-events: auto;
    color: #f5a623;
  }
`

const DeleteBtn = styled.button`
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border: none;
  background: none;
  color: var(--color-text-3);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  &:hover {
    color: var(--color-error);
  }
  ${Item}:hover & {
    opacity: 1;
    pointer-events: auto;
  }
`

export default Playlist
