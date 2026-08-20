import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioEngine } from '../services/audioEngine'
import { PlayerStore, type PlayerStoreDeps } from '../services/playerStore'
import type { MusicTrack, PlayMode, RadioStation } from '../types'

/** 独立引擎 + 独立 store 实例：测试间完全隔离（生产单例不受影响） */
function createStore(mode: PlayMode = 'sequential') {
  const engine = new AudioEngine()
  const store = new PlayerStore(engine)
  let playMode = mode
  let favoritesActive = false
  const deps: PlayerStoreDeps = {
    getPlayMode: () => playMode,
    getFavoritesActive: () => favoritesActive,
    setPlayMode: (m) => {
      playMode = m
    },
    setFavoritesActive: (v) => {
      favoritesActive = v
    }
  }
  store.attachDeps(deps)
  const el = (engine as unknown as { el: HTMLAudioElement }).el
  const dispatch = (type: string) => el.dispatchEvent(new Event(type))
  return { engine, store, el, dispatch, setMode: (m: PlayMode) => (playMode = m) }
}

function track(id: number, favorite: 0 | 1 = 0): MusicTrack {
  return {
    id,
    filePath: `D:\\Music\\t${id}.mp3`,
    title: `曲目${id}`,
    artist: '',
    album: '',
    duration: 100,
    coverPath: '',
    thumbPath: '',
    size: 1,
    addedAt: 1,
    favorite,
    order: id
  }
}

function station(url: string): RadioStation {
  return { name: url, url, favicon: '', country: '', tags: '', bitrate: 128, codec: '', homepage: '' }
}

const TRACKS = [track(1), track(2), track(3)]

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PlayerStore 本地播放', () => {
  it('idle 状态 toggle 播放第一首', () => {
    const { store, engine, dispatch } = createStore()
    store.setTracks(TRACKS)
    store.toggle()
    expect(engine.snapshot().url).toBe('file:///D:/Music/t1.mp3')
    dispatch('play')
    expect(store.getLocalSnapshot().isPlaying).toBe(true)
    expect(store.getLocalSnapshot().currentId).toBe(1)
  })

  it('顺序模式 next 到末尾回绕，prev 回绕', () => {
    const { store } = createStore()
    store.setTracks(TRACKS)
    store.next()
    expect(store.getLocalSnapshot().currentId).toBe(1)
    store.next()
    store.next()
    expect(store.getLocalSnapshot().currentId).toBe(3)
    store.next()
    expect(store.getLocalSnapshot().currentId).toBe(1) // 回绕
    store.prev()
    expect(store.getLocalSnapshot().currentId).toBe(3) // 回绕
  })

  it('单曲循环：ended 原地重播（seek 0 + play），不切下一首', () => {
    const { store, el, dispatch } = createStore('single')
    store.setTracks(TRACKS)
    store.playIndex(1)
    dispatch('play')
    Object.defineProperty(el, 'duration', { value: 100, configurable: true, writable: true })
    el.currentTime = 50
    dispatch('ended')
    expect(store.getLocalSnapshot().currentId).toBe(2)
    expect(el.currentTime).toBe(0) // seek(0) 生效
  })

  it('ended 非单曲循环自动切下一首（挂在引擎上，页面卸载后依然生效）', () => {
    const { store, dispatch } = createStore()
    store.setTracks(TRACKS)
    store.playIndex(0)
    dispatch('ended')
    expect(store.getLocalSnapshot().currentId).toBe(2)
  })

  it('加载失败全列表跳完停止并提示', () => {
    const { store, dispatch } = createStore()
    store.setTracks(TRACKS)
    store.playIndex(0)
    dispatch('error')
    dispatch('error')
    dispatch('error')
    const s = store.getLocalSnapshot()
    expect(s.currentId).toBeNull()
    expect(s.tip).toBe('全部曲目均无法播放')
  })

  it('playTrackById 曲库未就绪时用 fallback 播放（音乐挂件路径）', () => {
    const { store, engine } = createStore()
    store.setTracks([]) // 主窗口从未打开音乐页
    store.playTrackById(9, { filePath: 'D:\\Music\\w.mp3', title: 'W', artist: '', album: '', duration: 0 })
    expect(engine.snapshot().url).toBe('file:///D:/Music/w.mp3')
    expect(store.getLocalSnapshot().currentId).toBe(9)
  })

  it('收藏夹模式：激活后只在收藏池内切换', () => {
    const { store } = createStore()
    store.setTracks([track(1), track(2, 1), track(3, 1)])
    store.toggleFavoritesMode()
    store.playIndex(0) // 播放非收藏曲 1
    store.next()
    // 播完落回收藏池：切到收藏曲 2
    expect(store.getLocalSnapshot().currentId).toBe(2)
    store.next()
    expect(store.getLocalSnapshot().currentId).toBe(3)
    store.next()
    expect(store.getLocalSnapshot().currentId).toBe(2) // 收藏池回绕
  })
})

describe('PlayerStore FM 电台', () => {
  it('fmPlay 抢占引擎：本地状态复位，FM 进入 connecting', () => {
    const { store, engine, dispatch } = createStore()
    store.setTracks(TRACKS)
    store.playIndex(0)
    dispatch('play')
    expect(store.getLocalSnapshot().isPlaying).toBe(true)

    store.setStations([station('http://a/stream'), station('http://b/stream')])
    store.fmPlay('http://a/stream')
    expect(engine.snapshot().owner).toBe('fm')
    expect(store.getLocalSnapshot().isPlaying).toBe(false) // onStop('local') 复位
    expect(store.getFmSnapshot().status).toBe('connecting')
    expect(store.getFmSnapshot().url).toBe('http://a/stream')
  })

  it('playing 事件清除 watchdog 并进入 playing；暂停 toggle 可恢复', () => {
    const { store, dispatch } = createStore()
    store.setStations([station('http://a/stream')])
    store.fmPlay('http://a/stream')
    dispatch('playing')
    expect(store.getFmSnapshot().status).toBe('playing')

    store.fmToggle()
    expect(store.getFmSnapshot().status).toBe('paused')
    store.fmToggle()
    expect(store.getFmSnapshot().status).toBe('connecting')
    dispatch('playing')
    expect(store.getFmSnapshot().status).toBe('playing')
  })

  it('10s 未连接判失败：延迟 2s 自动切下一台', () => {
    const { store, engine } = createStore()
    store.setStations([station('http://a/stream'), station('http://b/stream')])
    store.fmPlay('http://a/stream')
    vi.advanceTimersByTime(10_000)
    expect(store.getFmSnapshot().status).toBe('error')
    vi.advanceTimersByTime(2_000)
    expect(engine.snapshot().url).toBe('http://b/stream')
    expect(store.getFmSnapshot().status).toBe('connecting')
  })

  it('连续失败达到电台总数则停止', () => {
    const { store, engine } = createStore()
    store.setStations([station('http://a/stream'), station('http://b/stream')])
    store.fmPlay('http://a/stream')
    // 两台各失败一次（watchdog + 2s 延迟切台）
    vi.advanceTimersByTime(12_000)
    vi.advanceTimersByTime(12_000)
    const s = store.getFmSnapshot()
    expect(s.status).toBe('error')
    expect(s.url).toBeNull()
    expect(engine.snapshot().url).toBe('')
  })
})

describe('PlayerStore 引擎归属互斥', () => {
  it('FM 播放中 toggle 本地：抢回引擎重播当前曲，而不是暂停 FM', () => {
    const { store, engine, dispatch } = createStore()
    store.setTracks(TRACKS)
    store.playIndex(1)
    dispatch('play')
    store.setStations([station('http://a/stream')])
    store.fmPlay('http://a/stream')
    dispatch('playing')

    store.toggle() // 本地主按钮
    expect(engine.snapshot().owner).toBe('local')
    expect(engine.snapshot().url).toBe('file:///D:/Music/t2.mp3')
    expect(store.getLocalSnapshot().currentId).toBe(2)
    expect(store.getFmSnapshot().status).toBe('idle') // onStop('fm') 复位
  })
})
