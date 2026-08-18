import { DynamicVirtualList, type DynamicVirtualListRef } from '@renderer/components/VirtualList'
import { type FC, memo, useEffect, useRef } from 'react'
import styled from 'styled-components'

import { formatTime, toFileUrl } from '../services/playLogic'
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

/**
 * 播放列表：封面缩略图两级回退、播放行频谱高亮、悬停 ★/✕、拖拽排序（过滤状态下禁用）
 * memo：播放进度 timeupdate（约 4Hz）只应刷新进度条，不得让整张列表 O(N) 重建
 * 虚拟化：DynamicVirtualList 只渲染可见行（大曲库时 DOM/图片内存从 O(N) 降到 O(视口)）
 */
export const Playlist: FC<PlaylistProps> = memo(function Playlist({
  tracks,
  currentId,
  isPlaying,
  dragEnabled,
  onPlay,
  onToggleFavorite,
  onDelete,
  onReorder
}) {
  const dragSrcId = useRef<number | null>(null)
  const listRef = useRef<DynamicVirtualListRef>(null)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  // 自动滚动：仅在切歌（currentId 变化）或恢复播放（isPlaying 变 true）时把当前曲滚入视口。
  // 刻意不依赖 tracks —— 收藏/删除/拖拽重排/重扫产生的列表刷新不应打断用户正在浏览的位置
  useEffect(() => {
    if (currentId == null || !isPlaying) return
    const idx = tracksRef.current.findIndex((t) => t.id === currentId)
    if (idx >= 0) {
      listRef.current?.scrollToIndex(idx, { align: 'auto', behavior: 'smooth' })
    }
  }, [currentId, isPlaying])

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
    <ListWrap role="listbox">
      <DynamicVirtualList ref={listRef} list={tracks} estimateSize={() => ROW_HEIGHT} size="100%">
        {(t) => {
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
              {playing ? <Eq paused={!isPlaying} /> : t.duration > 0 ? formatTime(t.duration) : ''}
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
      }}
      </DynamicVirtualList>
    </ListWrap>
  )
})

/** 行高 = Item 52px（封面 40 + padding 12）+ 下边距 2px；虚拟列表估算必须与实测一致，否则首帧滚动位置偏移 */
const ROW_HEIGHT = 54



const ListWrap = styled.div`
  flex: 1;
  min-height: 0;
  padding: 4px 2px;
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
  /* 行间距（虚拟列表无 gap，用下边距补齐，保持与估算行高一致） */
  margin-bottom: 2px;
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
