import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { FolderPlus, Music4, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'

import { useLocalPlayer } from '../hooks/useLocalPlayer'
import { addFilesToLibrary, addFolderToLibrary, reorderTracks, rescanFolders } from '../services/musicLibrary'
import type { MusicTrack } from '../types'
import { mx, MXCard, MXDialog, MXIconButton, MXPrimaryButton, MXSearchInput } from './mx'
import PlayerControls from './PlayerControls'
import Playlist from './Playlist'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'weba', 'webm']

/**
 * 本地音乐播放器（左栏卡片）：工具行 + 播放列表 + 播放舱
 */
const LocalMusicPlayer: FC = () => {
  const allTracks = useLiveQuery(async () => (await db.music_tracks.orderBy('order').toArray()) ?? [], [], [])
  const tracks = allTracks ?? []

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [clearOpen, setClearOpen] = useState(false)

  const player = useLocalPlayer(tracks)

  // 进入页面：静默增量重扫已保存文件夹 + 后台补齐缩略图（useLiveQuery 自动刷新列表）
  useEffect(() => {
    void (async () => {
      const folders = await db.music_folders.toArray().catch(() => [])
      if (folders.length > 0) void rescanFolders().catch(() => {})
      void window.api.music.ensureThumbs().catch(() => {})
    })()
  }, [])

  // 搜索 200ms 防抖
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim().toLowerCase()), 200)
    return () => clearTimeout(timer)
  }, [searchInput])

  const visibleTracks = useMemo(() => {
    let view: MusicTrack[] = tracks
    if (player.favoritesActive) view = view.filter((t) => t.favorite === 1)
    if (searchQuery) {
      view = view.filter((t) => [t.title, t.artist, t.album].some((f) => (f || '').toLowerCase().includes(searchQuery)))
    }
    return view
  }, [tracks, player.favoritesActive, searchQuery])

  const playTrack = useCallback(
    (track: MusicTrack) => {
      const idx = tracks.findIndex((t) => t.id === track.id)
      if (idx >= 0) player.playIndex(idx, true)
    },
    [tracks, player.playIndex]
  )

  const onAddFiles = async () => {
    const files = await window.api.file
      .select({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '音频', extensions: AUDIO_EXTENSIONS }]
      })
      .catch(() => null)
    if (!files || files.length === 0) return
    const added = await addFilesToLibrary(files.map((f) => ({ filePath: f.path, size: f.size })))
    player.showTip(added > 0 ? `已添加 ${added} 首曲目` : '没有新曲目（可能已添加过）')
  }

  const onAddFolder = async () => {
    const folder = await window.api.file.selectFolder().catch(() => null)
    if (!folder) return
    try {
      const { added, truncated } = await addFolderToLibrary(folder)
      player.showTip(`已添加 ${added} 首曲目${truncated ? '（超过 2000 首已截断）' : ''}`)
    } catch {
      player.showTip('扫描文件夹失败')
    }
  }

  const onRefresh = async () => {
    try {
      const added = await rescanFolders()
      player.showTip(added > 0 ? `新增 ${added} 首曲目` : '曲库已是最新')
    } catch {
      player.showTip('刷新失败')
    }
  }

  const onClear = async () => {
    setClearOpen(false)
    player.stop()
    await db.music_tracks.clear()
    player.showTip('播放列表已清空')
  }

  const onToggleFavorite = useCallback(
    async (track: MusicTrack) => {
      const favorite: 0 | 1 = track.favorite === 1 ? 0 : 1
      await db.music_tracks.update(track.id, { favorite })
      if (favorite === 0 && player.favoritesActive && track.id === player.currentId) {
        player.markPendingReturn()
      }
    },
    [player.favoritesActive, player.currentId, player.markPendingReturn]
  )

  const onDelete = useCallback(
    async (track: MusicTrack) => {
      const wasCurrent = track.id === player.currentId
      // 删除前基于当前列表捕获索引（await 后 LiveQuery 可能已刷新列表，索引会漂移）
      const prevIndex = tracks.findIndex((t) => t.id === track.id)
      await db.music_tracks.delete(track.id)
      if (wasCurrent) player.onCurrentTrackDeleted(track.id!, prevIndex)
    },
    [tracks, player.currentId, player.onCurrentTrackDeleted]
  )

  const onReorder = useCallback((ids: number[]) => void reorderTracks(ids), [])

  const hasTracks = tracks.length > 0
  const emptyText = !hasTracks
    ? '曲库还是空的'
    : player.favoritesActive && visibleTracks.length === 0
      ? '还没有收藏'
      : searchQuery && visibleTracks.length === 0
        ? '没有匹配的曲目'
        : ''
  const emptyHint = !hasTracks
    ? '添加几首喜欢的音乐，随时开听'
    : player.favoritesActive
      ? '点击曲目旁的 ☆，把喜欢的收进收藏夹'
      : '换个关键词试试'

  return (
    <MXCard data-no-dnd>
      <Header>
        <HeaderTitle>
          <HeaderIcon>
            <Music4 size={16} />
          </HeaderIcon>
          本地音乐
          <CountChip>{tracks.length} 首</CountChip>
        </HeaderTitle>
      </Header>
      <Toolbar>
        <MXPrimaryButton onClick={onAddFiles} title="选择音频文件加入曲库">
          <Plus size={15} /> 添加音乐
        </MXPrimaryButton>
        <MXIconButton onClick={onAddFolder} title="添加整个文件夹（递归扫描）">
          <FolderPlus size={16} />
        </MXIconButton>
        <MXIconButton onClick={onRefresh} title="重新扫描已添加的文件夹">
          <RefreshCw size={16} />
        </MXIconButton>
        <MXIconButton $danger onClick={() => setClearOpen(true)} title="清空播放列表">
          <Trash2 size={16} />
        </MXIconButton>
        <MXSearchInput>
          <Search size={13} />
          <input
            placeholder="搜索曲目 / 艺术家 / 专辑"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </MXSearchInput>
      </Toolbar>
      {player.tip && (
        <TipBar role="status">
          <Sparkles size={12} /> {player.tip}
        </TipBar>
      )}
      {emptyText ? (
        <Empty>
          <EmptyIcon>
            <Music4 size={28} />
          </EmptyIcon>
          <EmptyTitle>{emptyText}</EmptyTitle>
          <EmptyHint>{emptyHint}</EmptyHint>
          {!hasTracks && (
            <MXPrimaryButton onClick={onAddFiles}>
              <Plus size={14} /> 添加音乐文件
            </MXPrimaryButton>
          )}
        </Empty>
      ) : (
        <Playlist
          tracks={visibleTracks}
          currentId={player.currentId}
          isPlaying={player.isPlaying}
          dragEnabled={!searchQuery && !player.favoritesActive}
          onPlay={playTrack}
          onToggleFavorite={onToggleFavorite}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      )}
      <PlayerControls
        track={player.currentTrack}
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        duration={player.duration}
        playMode={player.playMode}
        favoritesActive={player.favoritesActive}
        onToggle={player.toggle}
        onPrev={player.prev}
        onNext={() => player.next(false)}
        onSeek={player.seek}
        onSeekingChange={player.setSeeking}
        onToggleMode={player.togglePlayMode}
        onToggleFavorites={player.toggleFavoritesMode}
        onToggleFavoriteTrack={onToggleFavorite}
      />
      <MXDialog
        open={clearOpen}
        title="清空播放列表"
        okText="清空"
        danger
        onCancel={() => setClearOpen(false)}
        onOk={() => void onClear()}>
        将移除全部 {tracks.length} 首曲目（不会删除本地文件，收藏状态一并清除）。
      </MXDialog>
    </MXCard>
  )
}

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`

const HeaderTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: ${mx.text};
`

const HeaderIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: ${mx.accentSoft};
  color: ${mx.accent};
`

const CountChip = styled.span`
  font-size: 11px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: ${mx.text3};
  background: ${mx.soft};
  border-radius: 999px;
  padding: 2px 8px;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`

const TipBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  color: ${mx.accent};
  background: ${mx.accentSoft};
`

const Empty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
`

const EmptyIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: ${mx.soft};
  color: ${mx.accent};
  margin-bottom: 4px;
`

const EmptyTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${mx.text};
`

const EmptyHint = styled.div`
  font-size: 12px;
  color: ${mx.text3};
  margin-bottom: 8px;
`

export default LocalMusicPlayer
