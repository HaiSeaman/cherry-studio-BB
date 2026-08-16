import { FolderPlus, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Modal } from 'antd'
import { type FC, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import styled from 'styled-components'

import { db } from '@renderer/databases'

import { useLocalPlayer } from '../hooks/useLocalPlayer'
import { addFilesToLibrary, addFolderToLibrary, reorderTracks, rescanFolders } from '../services/musicLibrary'
import type { MusicTrack } from '../types'
import PlayerControls from './PlayerControls'
import Playlist from './Playlist'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'weba', 'webm']

/**
 * 本地音乐播放器（音乐页左栏）
 * 工具栏（+文件/+文件夹/刷新/清空/搜索）+ 播放列表 + 底部控制条
 */
const LocalMusicPlayer: FC = () => {
  const allTracks = useLiveQuery(async () => (await db.music_tracks.orderBy('order').toArray()) ?? [], [], [])
  const tracks = allTracks ?? []

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

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
      view = view.filter((t) =>
        [t.title, t.artist, t.album].some((f) => (f || '').toLowerCase().includes(searchQuery))
      )
    }
    return view
  }, [tracks, player.favoritesActive, searchQuery])

  const playTrack = (track: MusicTrack) => {
    const idx = tracks.findIndex((t) => t.id === track.id)
    if (idx >= 0) player.playIndex(idx, true)
  }

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

  const onClear = () => {
    Modal.confirm({
      title: '清空播放列表',
      content: `将移除全部 ${tracks.length} 首曲目（不会删除本地文件，收藏状态一并清除）`,
      okText: '清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        player.stop()
        await db.music_tracks.clear()
        player.showTip('播放列表已清空')
      }
    })
  }

  const onToggleFavorite = async (track: MusicTrack) => {
    const favorite: 0 | 1 = track.favorite === 1 ? 0 : 1
    await db.music_tracks.update(track.id!, { favorite })
    if (favorite === 0 && player.favoritesActive && track.id === player.currentId) {
      player.markPendingReturn()
    }
  }

  const onDelete = async (track: MusicTrack) => {
    const wasCurrent = track.id === player.currentId
    await db.music_tracks.delete(track.id!)
    if (wasCurrent) player.onCurrentTrackDeleted(track.id!)
  }

  const emptyText = !tracks || tracks.length === 0
    ? '点击「+文件」或「+文件夹」添加音乐'
    : player.favoritesActive && visibleTracks.length === 0
      ? '暂无收藏音乐，点击列表中的 ☆ 收藏'
      : searchQuery && visibleTracks.length === 0
        ? '未找到匹配曲目'
        : ''

  return (
    <Panel data-no-dnd>
      <Toolbar>
        <ToolBtn onClick={onAddFiles} title="添加音频文件">
          <Plus size={14} /> 文件
        </ToolBtn>
        <ToolBtn onClick={onAddFolder} title="添加文件夹（递归扫描）">
          <FolderPlus size={14} /> 文件夹
        </ToolBtn>
        <ToolBtn onClick={onRefresh} title="重新扫描已添加的文件夹">
          <RefreshCw size={14} /> 刷新
        </ToolBtn>
        <ToolBtn $danger onClick={onClear} title="清空播放列表">
          <Trash2 size={14} /> 清空
        </ToolBtn>
        <SearchInput>
          <Search size={13} />
          <input
            placeholder="搜索曲目/艺术家/专辑…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </SearchInput>
      </Toolbar>
      {player.tip && <TipBar role="status">{player.tip}</TipBar>}
      {emptyText ? (
        <Empty>{emptyText}</Empty>
      ) : (
        <Playlist
          tracks={visibleTracks}
          currentId={player.currentId}
          isPlaying={player.isPlaying}
          dragEnabled={!searchQuery && !player.favoritesActive}
          onPlay={playTrack}
          onToggleFavorite={onToggleFavorite}
          onDelete={onDelete}
          onReorder={(ids) => void reorderTracks(ids)}
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
    </Panel>
  )
}

const Panel = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  overflow: hidden;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`

const ToolBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: ${(p) => (p.$danger ? 'var(--color-error)' : 'var(--color-text-2)')};
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    border-color: ${(p) => (p.$danger ? 'var(--color-error)' : 'var(--color-primary)')};
    color: ${(p) => (p.$danger ? 'var(--color-error)' : 'var(--color-primary)')};
  }
`

const SearchInput = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 140px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--color-text-3);
  background: var(--color-background);
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text);
    font-size: 12px;
    &::placeholder {
      color: var(--color-text-3);
    }
  }
`

const TipBar = styled.div`
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-mute);
`

const Empty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  font-size: 13px;
`

export default LocalMusicPlayer
