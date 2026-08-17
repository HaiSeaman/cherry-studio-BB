import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLocalPlayer } from '../hooks/useLocalPlayer'
import { audioEngine } from '../services/audioEngine'
import type { MusicTrack } from '../types'

vi.mock('@renderer/store', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ musicSettings: { playMode: 'sequential', favoritesActive: false } })
}))

vi.mock('../services/autoAdvance', () => ({
  registerAutoAdvance: vi.fn()
}))

const TRACK: MusicTrack = {
  id: 7,
  filePath: 'D:\\Music\\a.mp3',
  title: '测试曲',
  artist: '测试歌手',
  album: '测试专辑',
  duration: 123,
  coverPath: '',
  thumbPath: '',
  size: 1024,
  addedAt: 1,
  favorite: 0,
  order: 0
}

/** 模拟 audio 元素处于"已加载/播放中/暂停中"的假状态（jsdom 不真正解码媒体） */
function fakeElState(state: { paused?: boolean; duration?: number; currentTime?: number }) {
  const el = (audioEngine as unknown as { el: HTMLAudioElement }).el
  for (const [key, value] of Object.entries(state)) {
    // paused 是原型 getter，直接赋值抛错，改用自有属性遮蔽
    Object.defineProperty(el, key, { value, configurable: true })
  }
}

/** 同 fakeElState，但属性可写（seek 测试需要 audioEngine.seek 真正写入 currentTime） */
function fakeWritableElState(state: { duration?: number; currentTime?: number }) {
  const el = (audioEngine as unknown as { el: HTMLAudioElement }).el
  for (const [key, value] of Object.entries(state)) {
    Object.defineProperty(el, key, { value, configurable: true, writable: true })
  }
}

beforeEach(() => {
  // 复位引擎：避免测试间相互污染
  audioEngine.stop()
  fakeElState({ paused: true, duration: 0, currentTime: 0 })
})

describe('useLocalPlayer 切页返回恢复', () => {
  it('播放中切走再切回：tracks 异步就绪后恢复曲目/进度（回归：播放舱空白但声音继续）', () => {
    // 模拟：切走 TAB 前正在播放 trackId=7，模块级引擎继续播放
    audioEngine.load('local', 'file:///D:/Music/a.mp3', { trackId: 7 })
    fakeElState({ paused: false, duration: 123, currentTime: 45 })

    // 重新挂载：useLiveQuery 首帧返回 []（异步查询未完成），随后曲库就绪
    const { result, rerender } = renderHook((props: { tracks: MusicTrack[] }) => useLocalPlayer(props.tracks), {
      initialProps: { tracks: [] as MusicTrack[] }
    })
    expect(result.current.currentId).toBeNull()

    act(() => rerender({ tracks: [TRACK] }))

    expect(result.current.currentId).toBe(7)
    expect(result.current.isPlaying).toBe(true)
    expect(result.current.duration).toBe(123)
    expect(result.current.currentTime).toBe(45)
  })

  it('暂停中切走再切回：恢复曲目与暂停态，不丢失播放舱信息', () => {
    audioEngine.load('local', 'file:///D:/Music/a.mp3', { trackId: 7 })
    fakeElState({ paused: true, duration: 123, currentTime: 30 })

    const { result, rerender } = renderHook((props: { tracks: MusicTrack[] }) => useLocalPlayer(props.tracks), {
      initialProps: { tracks: [] as MusicTrack[] }
    })
    act(() => rerender({ tracks: [TRACK] }))

    expect(result.current.currentId).toBe(7)
    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTime).toBe(30)
  })

  it('引擎未加载本地曲目时不误恢复', () => {
    audioEngine.stop()
    const { result, rerender } = renderHook((props: { tracks: MusicTrack[] }) => useLocalPlayer(props.tracks), {
      initialProps: { tracks: [] as MusicTrack[] }
    })
    act(() => rerender({ tracks: [TRACK] }))

    expect(result.current.currentId).toBeNull()
    expect(result.current.isPlaying).toBe(false)
  })

  it('切换到 FM 电台时保留当前曲目信息，仅停止播放', () => {
    // 1. 本地播放曲目
    audioEngine.load('local', 'file:///D:/Music/a.mp3', { trackId: 7 })
    fakeElState({ paused: false, duration: 123, currentTime: 50 })

    const { result } = renderHook((props: { tracks: MusicTrack[] }) => useLocalPlayer(props.tracks), {
      initialProps: { tracks: [TRACK] }
    })
    expect(result.current.currentId).toBe(7)
    expect(result.current.isPlaying).toBe(true)

    // 2. FM 电台抢占音频引擎
    act(() => {
      audioEngine.load('fm', 'https://example.com/stream')
    })

    // 3. 验证本地播放器状态：currentId 和 currentTrack 保留，isPlaying 变为 false
    expect(result.current.currentId).toBe(7)
    expect(result.current.currentTrack).toEqual(TRACK)
    expect(result.current.isPlaying).toBe(false)
  })
})

describe('useLocalPlayer FM 抢占后的播放舱控制', () => {
  it('FM 播放中点本地主按钮：抢回引擎重播当前曲，而不是暂停 FM 流', () => {
    audioEngine.load('local', 'file:///D:/Music/a.mp3', { trackId: 7 })
    fakeElState({ paused: false, duration: 123, currentTime: 50 })

    const { result } = renderHook((props: { tracks: MusicTrack[] }) => useLocalPlayer(props.tracks), {
      initialProps: { tracks: [TRACK] }
    })

    act(() => {
      audioEngine.load('fm', 'https://example.com/stream')
    })
    // FM 播放中（引擎 paused=false）：修复前 toggle 会误执行 audioEngine.pause() 暂停 FM
    fakeElState({ paused: false })

    act(() => {
      result.current.toggle()
    })

    const snap = audioEngine.snapshot()
    expect(snap.owner).toBe('local')
    expect(snap.url).toBe('file:///D:/Music/a.mp3')
    expect(result.current.currentId).toBe(7)
  })

  it('FM 暂停中点本地主按钮：抢回引擎重播当前曲，而不是恢复 FM 流', () => {
    audioEngine.load('local', 'file:///D:/Music/a.mp3', { trackId: 7 })
    fakeElState({ paused: false, duration: 123, currentTime: 50 })

    const { result } = renderHook((props: { tracks: MusicTrack[] }) => useLocalPlayer(props.tracks), {
      initialProps: { tracks: [TRACK] }
    })

    act(() => {
      audioEngine.load('fm', 'https://example.com/stream')
    })
    // FM 暂停中（引擎 paused=true）：修复前 toggle 会误执行 audioEngine.play() 恢复 FM
    fakeElState({ paused: true })

    act(() => {
      result.current.toggle()
    })

    expect(audioEngine.snapshot().owner).toBe('local')
    expect(audioEngine.snapshot().url).toBe('file:///D:/Music/a.mp3')
  })

  it('FM 抢占后拖动进度条：抢回引擎并定位到拖动位置，而不是作用于 FM 直播流', () => {
    audioEngine.load('local', 'file:///D:/Music/a.mp3', { trackId: 7 })
    fakeWritableElState({ duration: 123, currentTime: 50 })
    fakeElState({ paused: false })

    const { result } = renderHook((props: { tracks: MusicTrack[] }) => useLocalPlayer(props.tracks), {
      initialProps: { tracks: [TRACK] }
    })

    act(() => {
      audioEngine.load('fm', 'https://example.com/stream')
    })

    act(() => {
      result.current.seek(80)
    })

    expect(audioEngine.snapshot().owner).toBe('local')
    expect(audioEngine.currentTime).toBe(80)
    expect(result.current.currentTime).toBe(80)
  })
})
