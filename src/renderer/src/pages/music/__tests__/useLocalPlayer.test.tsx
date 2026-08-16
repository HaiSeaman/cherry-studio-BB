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
})
