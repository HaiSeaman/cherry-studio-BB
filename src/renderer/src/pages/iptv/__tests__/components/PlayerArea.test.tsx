/**
 * PlayerArea 交互测试（无界面）：
 * - 单击视频区 → 250ms 后触发播放/暂停切换（store.toggle），窗口内不触发
 * - 双击 → 全屏，且取消未触发的单击（不顺手暂停）
 * - 右上角 ✕ → 关闭播放回待机，且不触发舞台单击
 * - 待机（未播放）时不显示关闭按钮
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PlayerArea } from '../../components/PlayerArea'
import { iptvPlayerStore } from '../../services/playerStore'
import type { IptvChannel } from '../../types'

vi.mock('hls.js', () => ({ default: { isSupported: () => false } }))
vi.mock('mpegts.js', () => ({
  default: {
    getFeatureList: () => ({ mseLivePlayback: false }),
    createPlayer: vi.fn(),
    Events: {}
  }
}))

const channel: IptvChannel = {
  id: 0,
  playlistId: 0,
  name: '测试频道',
  url: 'http://x/a.mp4',
  logo: null,
  group: null,
  tvgId: null
}

const noop = () => {}

const baseProps = {
  volume: 80,
  maximized: false,
  isLocal: false,
  playbackRate: 1,
  playMode: 'order' as const,
  onVolume: noop,
  onToggleMute: noop,
  onToggleMaximize: noop,
  onSeek: noop,
  onRate: noop,
  onCycleMode: noop,
  onPrev: noop,
  onNext: noop,
  onFilesDropped: noop,
  onProgress: noop
}

describe('PlayerArea：单击暂停/继续 与 关闭播放', () => {
  let toggleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // jsdom 未实现媒体 API（play/pause/load 只发噪音），桩掉保持输出干净
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined as never)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockReturnValue(undefined as never)
    toggleSpy = vi.spyOn(iptvPlayerStore, 'toggle')
    iptvPlayerStore.stop()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('单击视频区：250ms 内不切换，250ms 后触发 toggle', () => {
    vi.useFakeTimers()
    iptvPlayerStore.play(channel, false)
    render(<PlayerArea {...baseProps} />)
    // video 是 store 单例，挂载后被 append 进舞台；点击它 = 点击视频区（事件冒泡到舞台）
    fireEvent.click(iptvPlayerStore.video)
    expect(toggleSpy).not.toHaveBeenCalled() // 延迟窗口内不生效
    vi.advanceTimersByTime(250)
    expect(toggleSpy).toHaveBeenCalledTimes(1)
  })

  it('双击视频区：取消未触发的单击（toggle 不被调用），并请求全屏', () => {
    vi.useFakeTimers()
    iptvPlayerStore.play(channel, false)
    render(<PlayerArea {...baseProps} />)
    // jsdom 没实现 Fullscreen API：补桩以便断言
    const fsSpy = vi.fn(() => Promise.resolve())
    HTMLElement.prototype.requestFullscreen = fsSpy as never
    // 真实浏览器双击的事件序列：click → click → dblclick
    fireEvent.click(iptvPlayerStore.video)
    fireEvent.click(iptvPlayerStore.video)
    fireEvent.doubleClick(iptvPlayerStore.video)
    vi.advanceTimersByTime(250)
    expect(toggleSpy).not.toHaveBeenCalled()
    expect(fsSpy).toHaveBeenCalledTimes(1)
  })

  it('点击右上角 ✕：回待机断流，且不触发舞台单击', () => {
    vi.useFakeTimers()
    iptvPlayerStore.play(channel, false)
    render(<PlayerArea {...baseProps} />)
    fireEvent.click(screen.getByLabelText('关闭播放'))
    const s = iptvPlayerStore.getSnapshot()
    expect(s.status).toBe('idle')
    expect(s.current).toBeNull()
    vi.advanceTimersByTime(300) // 若 stopPropagation 失效，这里会等到单击定时器触发
    expect(toggleSpy).not.toHaveBeenCalled()
  })

  it('待机（未播放）时不显示关闭按钮', () => {
    render(<PlayerArea {...baseProps} />)
    expect(screen.queryByLabelText('关闭播放')).toBeNull()
  })

  it('直播播放中：LIVE 角标与关闭按钮各只渲染一份（重复渲染回归）', () => {
    iptvPlayerStore.play({ ...channel, url: 'http://x/live.mp4' }, true)
    render(<PlayerArea {...baseProps} />)
    fireEvent(iptvPlayerStore.video, new Event('playing')) // connecting → playing，角标出现
    expect(screen.getAllByText('LIVE')).toHaveLength(1)
    expect(screen.getAllByLabelText('关闭播放')).toHaveLength(1)
  })
})
