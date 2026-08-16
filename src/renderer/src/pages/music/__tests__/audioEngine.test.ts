import { describe, expect, it, vi } from 'vitest'

import { AudioEngine } from '../services/audioEngine'

describe('AudioEngine 归属切换与监听自检', () => {
  it('监听在归属被另一方抢占后保持挂载，且归属切回后继续生效（进度条 BUG 回归）', () => {
    const engine = new AudioEngine()
    const localPlay = vi.fn()
    const localTime = vi.fn()

    // 本地播放器挂载时注册监听
    engine.on('local', 'play', localPlay)
    engine.on('local', 'timeupdate', localTime)

    // 用户先播放 FM → 引擎归属切到 fm，local 监听被自检忽略
    engine.load('fm', 'http://radio.example/stream')
    ;(engine as any).el.dispatchEvent(new Event('play'))
    expect(localPlay).not.toHaveBeenCalled()

    // 回到本地播放 → local 监听自动恢复生效（修复前这里会永久失效）
    engine.load('local', 'file:///D:/Music/a.mp3', { trackId: 1 })
    ;(engine as any).el.dispatchEvent(new Event('play'))
    ;(engine as any).el.dispatchEvent(new Event('timeupdate'))
    expect(localPlay).toHaveBeenCalledTimes(1)
    expect(localTime).toHaveBeenCalledTimes(1)
  })

  it('claim 抢占时触发旧方的 onStop 回调，清除后不再触发', () => {
    const engine = new AudioEngine()
    const onFmStop = vi.fn()
    engine.onStop('fm', onFmStop)
    engine.load('fm', 'http://radio.example/stream')
    engine.load('local', 'file:///D:/Music/a.mp3')
    expect(onFmStop).toHaveBeenCalledTimes(1)

    engine.onStop('fm', null)
    engine.load('fm', 'http://radio.example/stream')
    engine.load('local', 'file:///D:/Music/b.mp3')
    expect(onFmStop).toHaveBeenCalledTimes(1)
  })

  it('快照返回当前归属/地址/元数据', () => {
    const engine = new AudioEngine()
    engine.load('local', 'file:///D:/Music/a.mp3', { trackId: 42 })
    const snap = engine.snapshot()
    expect(snap.owner).toBe('local')
    expect(snap.url).toBe('file:///D:/Music/a.mp3')
    expect(snap.meta).toEqual({ trackId: 42 })
  })

  it('重复加载同一地址时复位播放位置（点击当前曲目 = 从头播放）', () => {
    const engine = new AudioEngine()
    engine.load('local', 'file:///D:/Music/a.mp3')
    const el = (engine as any).el
    el.currentTime = 42
    engine.load('local', 'file:///D:/Music/a.mp3')
    expect(el.currentTime).toBe(0)
  })

  it('音量映射 0-100 → 0-1', () => {
    const engine = new AudioEngine()
    engine.setVolume(80)
    expect((engine as any).el.volume).toBeCloseTo(0.8)
    engine.setVolume(0)
    expect((engine as any).el.volume).toBe(0)
  })
})
