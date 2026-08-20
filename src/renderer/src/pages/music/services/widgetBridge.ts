import { db } from '@renderer/databases'
import store from '@renderer/store'
import type { WidgetMsg, WidgetPlayerState } from '@renderer/widgets/music/protocol'

import { setFavoritesActive, setPlayMode, setVolume } from '../store/musicSettingsSlice'
import { audioEngine } from './audioEngine'
import { playerStore } from './playerStore'

let bridgeInitialized = false
let widgetConnected = false
let posTimer: ReturnType<typeof setInterval> | null = null

function buildState(): WidgetPlayerState {
  const ms = store.getState().musicSettings
  const local = playerStore.getLocalSnapshot()
  const fm = playerStore.getFmSnapshot()
  const source = playerStore.getSource()
  const track = local.currentTrack
  return {
    source,
    playing: source === 'fm' ? fm.status === 'playing' : local.isPlaying,
    localPlaying: local.isPlaying,
    track: track
      ? { id: track.id!, title: track.title, artist: track.artist, album: track.album, duration: track.duration }
      : null,
    position: audioEngine.currentTime,
    duration: audioEngine.duration,
    volume: ms.volume,
    playMode: ms.playMode,
    fm: fm.url ? { url: fm.url, status: fm.status, kbps: fm.kbps, errorMsg: fm.errorMsg } : null
  }
}

function send(msg: WidgetMsg): void {
  void window.api.musicWidget.postToWidget(msg)
}

/** 4/s 进度广播（挂件连接且播放中才跑；暂停/停止随 update 停表） */
function ensureTicker(playing: boolean): void {
  const shouldRun = widgetConnected && playing
  if (shouldRun && !posTimer) {
    posTimer = setInterval(() => {
      send({ t: 'pos', p: audioEngine.currentTime, d: audioEngine.duration })
    }, 250)
  } else if (!shouldRun && posTimer) {
    clearInterval(posTimer)
    posTimer = null
  }
}

function pushUpdate(): void {
  const s = buildState()
  send({ t: 'update', s })
  ensureTicker(s.playing)
}

/** 处理挂件消息（preload onMessage 监听回调，仅收挂件方向） */
export function handleWidgetMessage(msg: WidgetMsg): void {
  switch (msg.t) {
    case 'snapshot:req': {
      // 快照时同步应用持久化音量到引擎（音乐页从未打开时 VolumeControl 未挂载的场景）
      widgetConnected = true
      audioEngine.setVolume(store.getState().musicSettings.volume)
      const s = buildState()
      ensureTicker(s.playing)
      send({ t: 'snapshot', s, stations: store.getState().musicSettings.customStations })
      break
    }
    case 'cmd':
      switch (msg.a) {
        case 'togglePlay':
          playerStore.toggle()
          break
        case 'next':
          playerStore.next()
          break
        case 'prev':
          playerStore.prev()
          break
        case 'togglePlayMode':
          playerStore.togglePlayMode()
          break
        case 'fmToggle':
          playerStore.fmToggle()
          break
        case 'seek':
          playerStore.seek(msg.v)
          break
        case 'volume':
          audioEngine.setVolume(msg.v)
          store.dispatch(setVolume(msg.v))
          break
        case 'playTrack':
          playerStore.playTrackById(msg.id, { filePath: msg.filePath, title: '', artist: '', album: '', duration: 0 })
          break
        case 'playFm':
          playerStore.fmPlay(msg.url)
          break
        default:
          break
      }
      break
    // update / pos 是主窗口 → 挂件方向，忽略
    default:
      break
  }
}

/**
 * 音乐挂件消息桥（主窗口侧）：App 根组件 import 本模块即完成初始化。
 * 职责：注入 playerStore 的 Redux 依赖、预载曲库、应答快照、路由挂件命令、广播状态更新。
 * 幂等守卫防 HMR 重载重复注册；挂件关闭时主进程丢弃转发消息，本桥无感知、零开销。
 */
export function initWidgetBridge(): void {
  if (bridgeInitialized) return
  bridgeInitialized = true

  // playerStore 读写 Redux 的通道（主窗口唯一注入点）
  playerStore.attachDeps({
    getPlayMode: () => store.getState().musicSettings.playMode,
    getFavoritesActive: () => store.getState().musicSettings.favoritesActive,
    setPlayMode: (m) => store.dispatch(setPlayMode(m)),
    setFavoritesActive: (v) => store.dispatch(setFavoritesActive(v))
  })

  // 预载曲库：挂件-only 会话（用户未开过音乐页）下 next/prev/自动切歌也有完整列表可用
  void db.music_tracks
    .orderBy('order')
    .toArray()
    .then((tracks) => playerStore.setTracks(tracks))
    .catch(() => {})

  // 播放状态变化（1Hz 进度节流内）→ 全量状态广播
  playerStore.subscribeLocal(pushUpdate)
  playerStore.subscribeFm(pushUpdate)

  // Redux 变化（音量/播放模式/自定义电台）→ 选择性广播（避免聊天等无关 dispatch 刷屏）
  let lastVolume = store.getState().musicSettings.volume
  let lastPlayMode = store.getState().musicSettings.playMode
  let lastCustomStations = store.getState().musicSettings.customStations

  store.subscribe(() => {
    const ms = store.getState().musicSettings
    if (ms.volume !== lastVolume || ms.playMode !== lastPlayMode) {
      lastVolume = ms.volume
      lastPlayMode = ms.playMode
      pushUpdate()
    }
    if (ms.customStations !== lastCustomStations) {
      lastCustomStations = ms.customStations
      send({ t: 'snapshot', s: buildState(), stations: ms.customStations })
    }
  })

  void window.api.musicWidget.onMessage((msg) => handleWidgetMessage(msg as WidgetMsg))
}
