import { useAppDispatch, useAppSelector } from '@renderer/store'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { registerAutoAdvance } from '../services/autoAdvance'
import { audioEngine } from '../services/audioEngine'
import { nextIndexInPool, prevIndexInPool, pushShuffleHistory, toFileUrl } from '../services/playLogic'
import { setFavoritesActive, setPlayMode } from '../store/musicSettingsSlice'
import type { MusicTrack, PlayMode } from '../types'

/**
 * 本地音乐播放状态机（复刻音乐tab页.md §4.5-4.6）：
 * - 三种播放模式：顺序 / 随机（历史栈上限 100，手动点击重置）/ 单曲循环
 * - 收藏夹播放池：激活后只在收藏内切换；当前曲非收藏时播完落回收藏池
 * - 加载失败自动跳下一首，全列表失败则停止
 * - currentId（Dexie 主键）作稳定标识，拖拽/删除后不漂移；随机历史也存 id
 */
export function useLocalPlayer(tracks: MusicTrack[]) {
  const dispatch = useAppDispatch()
  const playMode = useAppSelector((s) => s.musicSettings.playMode)
  const favoritesActive = useAppSelector((s) => s.musicSettings.favoritesActive)

  const [currentId, setCurrentId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [tip, setTip] = useState('')

  const tracksRef = useRef(tracks)
  tracksRef.current = tracks
  const currentIdRef = useRef<number | null>(null)
  currentIdRef.current = currentId
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const favoritesActiveRef = useRef(favoritesActive)
  favoritesActiveRef.current = favoritesActive
  const isSeekingRef = useRef(false)
  const shuffleHistoryRef = useRef<number[]>([]) // 存 track id
  const loadErrorCount = useRef(0)
  const pendingReturnToFavorites = useRef(false)
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const favoriteIndices = useMemo(
    () =>
      tracks
        .map((t, i) => ({ t, i }))
        .filter((x) => x.t.favorite === 1)
        .map((x) => x.i),
    [tracks]
  )
  const favoriteIndicesRef = useRef(favoriteIndices)
  favoriteIndicesRef.current = favoriteIndices

  const showTip = useCallback((msg: string) => {
    setTip(msg)
    if (tipTimer.current) clearTimeout(tipTimer.current)
    tipTimer.current = setTimeout(() => setTip(''), 3000)
  }, [])

  const getPool = useCallback((): number[] => {
    return favoritesActiveRef.current && favoriteIndicesRef.current.length > 0
      ? favoriteIndicesRef.current
      : tracksRef.current.map((_, i) => i)
  }, [])

  const currentIndex = useMemo(() => {
    if (currentId == null) return -1
    return tracks.findIndex((t) => t.id === currentId)
  }, [tracks, currentId])

  const stopPlayback = useCallback(() => {
    audioEngine.stop()
    setCurrentId(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [])

  /** 播放指定索引（manual=true 表示用户手动点击：随机历史重置） */
  const playIndex = useCallback((index: number, manual = false) => {
    const list = tracksRef.current
    const track = list[index]
    if (!track || track.id == null) return
    // 用户手动点播即接管播放目标：清除"播完落回收藏池"待定标记，避免单收藏池时同曲无限重播
    if (manual) pendingReturnToFavorites.current = false
    // 复位拖拽状态：防止 seek 拖拽丢失 mouseup 后进度条永久冻结
    isSeekingRef.current = false
    if (playModeRef.current === 'shuffle') {
      shuffleHistoryRef.current = manual ? [track.id] : pushShuffleHistory(shuffleHistoryRef.current, track.id)
    }
    setCurrentId(track.id)
    setCurrentTime(0)
    setDuration(0)
    audioEngine.load('local', toFileUrl(track.filePath), { trackId: track.id })
    audioEngine.play().catch(() => {
      // play 拒绝由 error 事件统一处理
    })
  }, [])

  /** 自动/手动切下一首（池内按模式选择；pendingReturn 时落回收藏池） */
  const next = useCallback(
    (_auto = true) => {
      const list = tracksRef.current
      if (list.length === 0) return
      let pool = getPool()
      let curIdx = list.findIndex((t) => t.id === currentIdRef.current)
      if (pendingReturnToFavorites.current) {
        // 当前曲非收藏且已播完：从收藏池头部继续
        pendingReturnToFavorites.current = false
        curIdx = -1
        pool = favoriteIndicesRef.current.length > 0 ? favoriteIndicesRef.current : pool
        if (pool.length === 0) return stopPlayback()
      }
      if (pool.length === 0) return stopPlayback()
      const mode = playModeRef.current === 'shuffle' ? 'shuffle' : 'sequential'
      const nextIdx = nextIndexInPool(pool, curIdx, mode)
      if (nextIdx < 0) return stopPlayback()
      playIndex(nextIdx)
    },
    [getPool, playIndex, stopPlayback]
  )

  const nextRef = useRef(next)
  nextRef.current = next

  /** 播放结束：单曲循环原地重播，否则自动切下一首（注册到模块级单例，页面卸载后依然生效） */
  const onEnded = useCallback(() => {
    if (playModeRef.current === 'single' && currentIdRef.current != null) {
      audioEngine.seek(0)
      audioEngine.play().catch(() => {})
      return
    }
    nextRef.current(true)
  }, [])

  /** 加载失败：计数累计，全列表失败则停止，否则自动跳下一首 */
  const onError = useCallback(() => {
    if (currentIdRef.current == null) return
    loadErrorCount.current += 1
    if (loadErrorCount.current >= tracksRef.current.length) {
      loadErrorCount.current = 0
      stopPlayback()
      showTip('全部曲目均无法播放')
      return
    }
    nextRef.current(true)
  }, [showTip, stopPlayback])

  const prev = useCallback(() => {
    const list = tracksRef.current
    if (list.length === 0) return
    // 随机模式优先回溯历史栈（弹出当前，回到上一曲）
    if (playModeRef.current === 'shuffle' && shuffleHistoryRef.current.length > 1) {
      shuffleHistoryRef.current.pop()
      const lastId = shuffleHistoryRef.current[shuffleHistoryRef.current.length - 1]
      const idx = list.findIndex((t) => t.id === lastId)
      if (idx >= 0) return playIndex(idx)
    }
    const pool = getPool()
    if (pool.length === 0) return
    const curIdx = list.findIndex((t) => t.id === currentIdRef.current)
    const prevIdx = prevIndexInPool(pool, curIdx)
    if (prevIdx >= 0) playIndex(prevIdx)
  }, [getPool, playIndex])

  const toggle = useCallback(() => {
    if (currentIdRef.current == null) {
      next(false)
      return
    }
    if (audioEngine.paused) {
      audioEngine.play().catch(() => {})
    } else {
      audioEngine.pause()
    }
  }, [next])

  const seek = useCallback((time: number) => {
    audioEngine.seek(time)
    setCurrentTime(time)
  }, [])

  /** 播放模式循环切换：顺序 → 随机 → 单曲 */
  const togglePlayMode = useCallback(() => {
    const order: PlayMode[] = ['sequential', 'shuffle', 'single']
    const nextMode = order[(order.indexOf(playModeRef.current) + 1) % order.length]
    shuffleHistoryRef.current = []
    dispatch(setPlayMode(nextMode))
  }, [dispatch])

  /** 收藏夹播放模式：空收藏拒绝激活；当前曲非收藏 → 播完落回收藏池 */
  const toggleFavoritesMode = useCallback(() => {
    if (!favoritesActiveRef.current) {
      if (favoriteIndicesRef.current.length === 0) {
        showTip('暂无收藏音乐，先点击列表中的 ☆ 收藏')
        return
      }
      const list = tracksRef.current
      const curIdx = list.findIndex((t) => t.id === currentIdRef.current)
      if (curIdx >= 0 && list[curIdx].favorite !== 1) {
        pendingReturnToFavorites.current = true
      }
      // 历史栈清掉非收藏曲，保证「上一首」只回溯到收藏
      shuffleHistoryRef.current = shuffleHistoryRef.current.filter((id) => {
        const t = list.find((x) => x.id === id)
        return t?.favorite === 1
      })
      dispatch(setFavoritesActive(true))
    } else {
      pendingReturnToFavorites.current = false
      dispatch(setFavoritesActive(false))
    }
  }, [dispatch, showTip])

  /** 收藏模式下取消收藏当前曲：播完落回收藏池 + 清理历史栈非收藏项 */
  const markPendingReturn = useCallback(() => {
    pendingReturnToFavorites.current = true
    const list = tracksRef.current
    shuffleHistoryRef.current = shuffleHistoryRef.current.filter((id) => {
      const t = list.find((x) => x.id === id)
      return t?.favorite === 1
    })
  }, [])

  /** 删除当前播放曲后接续播放原位置（prevIndex 由调用方在删除前基于旧列表捕获，规避 LiveQuery 刷新竞态） */
  const onCurrentTrackDeleted = useCallback(
    (deletedId: number, prevIndex: number) => {
      audioEngine.stop()
      setIsPlaying(false)
      // 随机历史清掉被删曲，避免「上一首」回溯到已删除曲目
      shuffleHistoryRef.current = shuffleHistoryRef.current.filter((id) => id !== deletedId)
      const list = tracksRef.current.filter((t) => t.id !== deletedId)
      if (list.length === 0) {
        stopPlayback()
        return
      }
      const resumeIdx = Math.min(prevIndex < 0 ? 0 : prevIndex, list.length - 1)
      let targetId = list[resumeIdx]?.id
      if (targetId == null) {
        stopPlayback()
        return
      }
      if (favoritesActiveRef.current && list[resumeIdx].favorite !== 1) {
        pendingReturnToFavorites.current = true
        // 基于删除后的实际列表重建收藏索引，避免旧索引错位
        const pool = list.map((t, i) => ({ t, i })).filter((x) => x.t.favorite === 1).map((x) => x.i)
        if (pool.length > 0) targetId = list[pool[0]].id
        else return stopPlayback()
      }
      // 按 id 反查当前列表索引：删除后 LiveQuery 可能尚未刷新（tracksRef 仍是旧列表），
      // 直接用 list 的索引会因偏移播到被删曲或错位曲目
      const actualIdx = tracksRef.current.findIndex((t) => t.id === targetId)
      if (actualIdx < 0) {
        stopPlayback()
        return
      }
      playIndex(actualIdx)
    },
    [playIndex, stopPlayback]
  )

  // 重新挂载（切回音乐页）时恢复播放状态：tracks 由 useLiveQuery 异步加载，首帧为空数组，
  // 必须等曲库就绪后才能按 trackId 匹配——本 effect 依赖 tracks 重跑，避免恢复被竞态吞掉
  // （修复前：恢复只在挂载瞬间执行一次，tracks 未就绪时被跳过，播放舱空白但声音继续）
  useEffect(() => {
    if (currentId != null || tracks.length === 0) return
    const snap = audioEngine.snapshot()
    if (snap.owner !== 'local' || !snap.url) return
    const meta = snap.meta as { trackId?: number } | null
    const track = meta?.trackId != null ? tracks.find((t) => t.id === meta.trackId) : null
    if (!track) return
    setCurrentId(track.id ?? null)
    setIsPlaying(!snap.paused)
    setDuration(audioEngine.duration)
    setCurrentTime(audioEngine.currentTime)
  }, [tracks, currentId])

  useEffect(() => {
    // 后台自动切歌：注册到模块级单例，卸载（切走 TAB）后继续生效，重新挂载时刷新
    registerAutoAdvance({ onEnded, onError })

    const offs = [
      audioEngine.on('local', 'loadedmetadata', () => {
        setDuration(audioEngine.duration)
      }),
      audioEngine.on('local', 'timeupdate', () => {
        // 进度节流：整秒变化才触发 React 渲染（timeupdate 原生 ~4Hz，整秒变化仅 1Hz），
        // 避免播放期间高频重建 UI 组件树（实测 4Hz 全量重渲染可占 ~3% CPU）
        if (!isSeekingRef.current) {
          const t = audioEngine.currentTime
          setCurrentTime((prev) => (Math.floor(prev) === Math.floor(t) ? prev : t))
        }
      }),
      audioEngine.on('local', 'play', () => setIsPlaying(true)),
      audioEngine.on('local', 'pause', () => setIsPlaying(false)),
      audioEngine.on('local', 'playing', () => {
        loadErrorCount.current = 0
      })
    ]
    audioEngine.onStop('local', () => {
      setCurrentId(null)
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    })
    return () => {
      offs.forEach((off) => off())
      audioEngine.onStop('local', null)
      if (tipTimer.current) clearTimeout(tipTimer.current)
    }
  }, [onEnded, onError, showTip, stopPlayback])

  const currentTrack = currentId != null ? (tracks.find((t) => t.id === currentId) ?? null) : null

  return {
    currentId,
    currentTrack,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    playMode,
    favoritesActive,
    favoriteCount: favoriteIndices.length,
    tip,
    showTip,
    setSeeking: (v: boolean) => {
      isSeekingRef.current = v
    },
    playIndex,
    next,
    prev,
    toggle,
    seek,
    togglePlayMode,
    toggleFavoritesMode,
    markPendingReturn,
    stop: stopPlayback,
    onCurrentTrackDeleted
  }
}
