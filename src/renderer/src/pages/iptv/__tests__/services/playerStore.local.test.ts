/**
 * 播放器内核行为测试（无界面）：
 * - file:// 协议强制 native 引擎（即使扩展名是 .flv/.ts 这类直播路由）
 * - 本地文件播放失败 → 直接失败态，不做无意义的自动重连
 * - 断点续播：loadedmetadata 后一次性 seek
 * - 播完（ended）→ 暂停态 + 通知页面连播回调
 * - 倍速：本地视频应用，直播不应用
 * - 关闭播放（stop）：回待机断流，迟到事件/错误/重连定时器全部失效
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { selectEngineMock } = vi.hoisted(() => ({
  selectEngineMock: vi.fn((_url: string) => 'native' as 'mpegts' | 'native')
}))

vi.mock('@renderer/databases', () => ({ default: {} }))
vi.mock('hls.js', () => ({ default: { isSupported: () => false } }))
vi.mock('mpegts.js', () => ({
  default: {
    getFeatureList: () => ({ mseLivePlayback: false }),
    createPlayer: vi.fn(),
    Events: {}
  }
}))
// playerStore 依赖 m3uService 的 selectEngine：用一个可控假实现观察 store 的路由决策
vi.mock('../../services/m3uService', () => ({ selectEngine: selectEngineMock }))

import { iptvPlayerStore } from '../../services/playerStore'
import type { IptvChannel } from '../../types'

const channel = (url: string): IptvChannel => ({
  id: 0,
  playlistId: 0,
  name: '测试',
  url,
  logo: null,
  group: null,
  tvgId: null
})

beforeEach(() => {
  vi.clearAllMocks()
  iptvPlayerStore.setOnEnded(null)
  // 假引擎路由：与真实 selectEngine 同语义（按扩展名），用于观察 store 的路由决策
  selectEngineMock.mockImplementation((url: string) => (/\.(ts|flv)($|\?)/i.test(url) ? 'mpegts' : 'native'))
  // jsdom 未实现媒体播放：桩掉 play/pause（store 内部都接了 catch，但桩掉更干净）
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined as never)
})

describe('播放器内核：本地视频行为', () => {
  it('file:// 强制 native 引擎（.flv 本地文件不走直播引擎）', () => {
    iptvPlayerStore.play(channel('file:///D:/movies/a.flv'), false)
    expect(selectEngineMock).not.toHaveBeenCalled() // 本地协议直接短路，不咨询扩展名路由
    expect(iptvPlayerStore.getSnapshot().engineType).toBe('native')
  })

  it('直播 url 仍按 selectEngine 路由', () => {
    iptvPlayerStore.play(channel('http://x/live.ts'), false)
    expect(iptvPlayerStore.getSnapshot().engineType).toBe('mpegts')
  })

  it('本地文件失败 → 立即 failed，不自动重连', () => {
    vi.useFakeTimers()
    try {
      iptvPlayerStore.play(channel('file:///D:/a.mp4'), false)
      iptvPlayerStore.video.dispatchEvent(new Event('error'))
      expect(iptvPlayerStore.getSnapshot().status).toBe('failed')
      expect(iptvPlayerStore.getSnapshot().retry.attempt).toBe(0)

      vi.advanceTimersByTime(30_000) // 若在重连，此时已回到 connecting
      expect(iptvPlayerStore.getSnapshot().status).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('直播流失败 → 走重连路径（attempt 递增）', () => {
    vi.useFakeTimers()
    try {
      iptvPlayerStore.play(channel('http://x/a.mp4'), true) // connecting（非暂停态才走自动重连）
      iptvPlayerStore.video.dispatchEvent(new Event('error'))
      expect(iptvPlayerStore.getSnapshot().status).toBe('connecting')
      expect(iptvPlayerStore.getSnapshot().retry.attempt).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('断点续播：loadedmetadata 后 seek 到 startAt', () => {
    iptvPlayerStore.play(channel('file:///D:/b.mkv'), false, 125)
    iptvPlayerStore.video.dispatchEvent(new Event('loadedmetadata'))
    expect(iptvPlayerStore.video.currentTime).toBe(125)
  })

  it('播完（ended）→ 翻为 paused 并触发连播回调', () => {
    iptvPlayerStore.play(channel('file:///D:/c.mp4'), false)
    const onEnded = vi.fn()
    iptvPlayerStore.setOnEnded(onEnded)
    iptvPlayerStore.video.dispatchEvent(new Event('ended'))
    expect(iptvPlayerStore.getSnapshot().status).toBe('paused')
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('倍速：本地视频直接生效', () => {
    iptvPlayerStore.play(channel('file:///D:/d.mp4'), false)
    iptvPlayerStore.setPlaybackRate(2)
    expect(iptvPlayerStore.video.playbackRate).toBe(2)
  })
})

describe('播放器内核：关闭播放（stop）', () => {
  beforeEach(() => {
    // stop() 会调 video.load() 重置媒体元素；jsdom 未实现（只发噪音），桩掉保持输出干净
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockReturnValue(undefined as never)
  })

  it('关闭 → 回到待机：current 清空、status=idle、src 被移除（真正断流）', () => {
    iptvPlayerStore.play(channel('http://x/a.mp4'), false)
    expect(iptvPlayerStore.getSnapshot().current).not.toBeNull()
    iptvPlayerStore.stop()
    const s = iptvPlayerStore.getSnapshot()
    expect(s.status).toBe('idle')
    expect(s.current).toBeNull()
    expect(iptvPlayerStore.video.getAttribute('src')).toBeNull()
  })

  it('关闭后浏览器补发的 pause 事件不再改状态（保持待机，不黑屏）', () => {
    iptvPlayerStore.play(channel('file:///D:/a.mp4'), false)
    iptvPlayerStore.stop()
    iptvPlayerStore.video.dispatchEvent(new Event('pause'))
    expect(iptvPlayerStore.getSnapshot().status).toBe('idle')
  })

  it('关闭后旧引擎迟到的错误被丢弃（保持待机，不翻回失败/重连）', () => {
    iptvPlayerStore.play(channel('http://x/a.mp4'), false)
    iptvPlayerStore.stop()
    iptvPlayerStore.video.dispatchEvent(new Event('error'))
    expect(iptvPlayerStore.getSnapshot().status).toBe('idle')
  })

  it('关闭后不再发生自动重连（定时器已取消）', () => {
    vi.useFakeTimers()
    try {
      iptvPlayerStore.play(channel('http://x/a.mp4'), true) // connecting（非暂停态才走自动重连）
      iptvPlayerStore.video.dispatchEvent(new Event('error')) // → connecting + 重连定时器
      expect(iptvPlayerStore.getSnapshot().status).toBe('connecting')
      iptvPlayerStore.stop()
      vi.advanceTimersByTime(30_000)
      expect(iptvPlayerStore.getSnapshot().status).toBe('idle')
      expect(iptvPlayerStore.getSnapshot().current).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('播放器内核：重连边界', () => {
  it('重连等待期内流自愈（playing）→ 撤销定时器，不再重启健康的流', () => {
    vi.useFakeTimers()
    try {
      iptvPlayerStore.play(channel('http://x/a.mp4'), true) // connecting
      iptvPlayerStore.video.dispatchEvent(new Event('error')) // attempt 1 + 1s 退避定时器
      expect(iptvPlayerStore.getSnapshot().status).toBe('connecting')
      iptvPlayerStore.video.dispatchEvent(new Event('playing')) // 引擎自愈出画
      expect(iptvPlayerStore.getSnapshot().status).toBe('playing')
      expect(iptvPlayerStore.getSnapshot().retry.attempt).toBe(0)
      vi.advanceTimersByTime(10_000) // 若定时器未被撤销，这里会重启流翻回 connecting
      expect(iptvPlayerStore.getSnapshot().status).toBe('playing')
    } finally {
      vi.useRealTimers()
    }
  })

  it('暂停中流断掉 → 直接失败，不自动重连违背暂停意图起播', () => {
    vi.useFakeTimers()
    try {
      iptvPlayerStore.play(channel('http://x/a.mp4'), true)
      iptvPlayerStore.video.dispatchEvent(new Event('playing'))
      iptvPlayerStore.video.dispatchEvent(new Event('pause')) // 用户主动暂停
      expect(iptvPlayerStore.getSnapshot().status).toBe('paused')
      iptvPlayerStore.video.dispatchEvent(new Event('error'))
      expect(iptvPlayerStore.getSnapshot().status).toBe('failed')
      vi.advanceTimersByTime(10_000) // 若走了自动重连，这里会翻回 connecting
      expect(iptvPlayerStore.getSnapshot().status).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })
})
