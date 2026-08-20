import { useAppSelector } from '@renderer/store'
import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { playerStore } from '../services/playerStore'
import type { MusicTrack } from '../types'

/**
 * 本地音乐播放 hook（playerStore 全局状态机的薄适配层）：
 * 状态与控制逻辑全部在 services/playerStore.ts（模块级单例，切页不丢），
 * 这里仅负责喂数据（曲库）、订阅状态切片、计算派生值；组件调用面 API 与旧实现完全一致。
 */
export function useLocalPlayer(tracks: MusicTrack[]) {
  const playMode = useAppSelector((s) => s.musicSettings.playMode)
  const favoritesActive = useAppSelector((s) => s.musicSettings.favoritesActive)

  useEffect(() => {
    playerStore.setTracks(tracks)
  }, [tracks])

  const st = useSyncExternalStore(playerStore.subscribeLocal, playerStore.getLocalSnapshot, playerStore.getLocalSnapshot)

  const favoriteIndices = useMemo(
    () =>
      tracks
        .map((t, i) => ({ t, i }))
        .filter((x) => x.t.favorite === 1)
        .map((x) => x.i),
    [tracks]
  )

  const currentIndex = useMemo(() => {
    if (st.currentId == null) return -1
    return tracks.findIndex((t) => t.id === st.currentId)
  }, [tracks, st.currentId])

  return {
    currentId: st.currentId,
    currentTrack: st.currentTrack,
    currentIndex,
    isPlaying: st.isPlaying,
    currentTime: st.currentTime,
    duration: st.duration,
    playMode,
    favoritesActive,
    favoriteCount: favoriteIndices.length,
    tip: st.tip,
    showTip: playerStore.showTip,
    setSeeking: playerStore.setSeeking,
    playIndex: playerStore.playIndex,
    next: playerStore.next,
    prev: playerStore.prev,
    toggle: playerStore.toggle,
    seek: playerStore.seek,
    togglePlayMode: playerStore.togglePlayMode,
    toggleFavoritesMode: playerStore.toggleFavoritesMode,
    markPendingReturn: playerStore.markPendingReturn,
    stop: playerStore.stop,
    onCurrentTrackDeleted: playerStore.onCurrentTrackDeleted
  }
}
