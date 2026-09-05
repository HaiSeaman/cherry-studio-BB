import Hls from 'hls.js'
import mpegts from 'mpegts.js'
import { useSyncExternalStore } from 'react'

import type { IptvChannel, IptvEngineType } from '../types'
import { selectEngine } from './m3uService'
import { initialRetry, onRetryError, onRetryPlaying, type RetryState } from './retryLogic'

export type PlayerStatus = 'idle' | 'connecting' | 'playing' | 'paused' | 'failed'

export type PlayerState = {
  current: IptvChannel | null
  engineType: IptvEngineType
  status: PlayerStatus
  errorMsg: string
  retry: RetryState
}

const INIT: PlayerState = {
  current: null,
  engineType: 'native',
  status: 'idle',
  errorMsg: '',
  retry: initialRetry
}

/**
 * IPTV 播放器单例：模块级 video 元素 + hls/mpegts/native 三引擎路由。
 * 与 React 生命周期解耦（页面切换状态保留），将来桌面小窗口可直接复用。
 */
class IptvPlayerStore {
  private state: PlayerState = { ...INIT }
  private listeners = new Set<() => void>()

  /** 模块级 video 元素：PlayerArea 挂载时 attach 到 DOM，卸载时 detach 但不销毁 */
  readonly video: HTMLVideoElement

  private hls: Hls | null = null
  private mpegtsPlayer: mpegts.Player | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private autoReconnect = true
  private playToken = 0 // 防竞态：切台后旧引擎的迟到错误不再触发重连

  // >100% 增益链路（懒创建）：MediaElementSource → Gain → destination。
  // ≤100% 时完全不建图，走 video.volume 原生路径零风险；MSE 流（hls/mpegts）blob: URL 无 CORS 污染，
  // native 直连流因主窗口 webSecurity:false 也不会被污染。
  private audioCtx: AudioContext | null = null
  private gainNode: GainNode | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null

  constructor() {
    this.video = document.createElement('video')
    this.video.playsInline = true
    this.bindNativeEvents()
  }

  // ---------------- 订阅（useSyncExternalStore 适配） ----------------

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = (): PlayerState => this.state

  private patch(p: Partial<PlayerState>): void {
    this.state = { ...this.state, ...p }
    this.listeners.forEach((cb) => cb())
  }

  // ---------------- 配置 ----------------

  setAutoReconnect(v: boolean): void {
    this.autoReconnect = v
  }

  // ---------------- 播放控制 ----------------

  play(channel: IptvChannel, autoplay = true): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.playToken += 1
    this.destroyEngines()

    // autoplay=false：流照常加载（重连/错误处理不变），但不自动起播，等用户点播放
    this.patch({
      current: channel,
      engineType: selectEngine(channel.url),
      status: autoplay ? 'connecting' : 'paused',
      errorMsg: '',
      retry: initialRetry
    })
    this.startEngine(channel.url, autoplay)
  }

  /** 手动重试（失败后点按钮） */
  retryNow(): void {
    const { current, status } = this.state
    if (!current || status === 'playing') return
    this.play(current)
  }

  toggle(): void {
    const { status } = this.state
    if (status === 'playing') {
      this.video.pause()
    } else if (status === 'paused' || status === 'failed') {
      if (status === 'failed') return this.retryNow()
      void this.video.play().catch(() => {})
    }
  }

  /**
   * 设置音量（0-200）：≤100% 走 video.volume 原生路径；>100% 懒创建 Web Audio 增益链路放大。
   * 图一旦建立，element volume 固定 1，统一由 gain 控制响度（避免两处叠加）。
   * Web Audio 不可用时夹回原生上限（element.volume 规范范围 0-1，超范围抛异常）。
   */
  setVolume(volume: number, muted: boolean): void {
    const v = Math.min(Math.max(volume, 0), 200)
    if (v > 100) this.ensureAudioGraph()
    if (this.gainNode) {
      this.video.volume = 1
      this.gainNode.gain.value = v / 100
    } else {
      this.video.volume = Math.min(v, 100) / 100
    }
    this.video.muted = muted
  }

  private ensureAudioGraph(): void {
    if (this.sourceNode) {
      void this.audioCtx?.resume()
      return
    }
    try {
      const ctx = new AudioContext()
      this.sourceNode = ctx.createMediaElementSource(this.video)
      this.gainNode = ctx.createGain()
      this.sourceNode.connect(this.gainNode)
      this.gainNode.connect(ctx.destination)
      this.audioCtx = ctx
      void ctx.resume()
    } catch {
      // Web Audio 不可用：放弃增益，保持 ≤100% 的原生音量路径
      this.audioCtx = null
      this.gainNode = null
      this.sourceNode = null
    }
  }

  // ---------------- 引擎 ----------------

  private startEngine(url: string, autoplay: boolean): void {
    const type = this.state.engineType
    if (type === 'hls' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      this.hls = hls
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return // 非致命错误 hls.js 自行恢复
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          // 媒体解码错误：软恢复一次（hls.js 官方推荐路径）
          try {
            hls.recoverMediaError()
            return
          } catch {
            /* 恢复失败走重连 */
          }
        }
        this.handleError(`流加载失败（${data.details}）`)
      })
      hls.loadSource(url)
      hls.attachMedia(this.video)
      if (autoplay) void this.video.play().catch(() => {})
      return
    }
    if (type === 'mpegts' && mpegts.getFeatureList().mseLivePlayback) {
      const isFlv = /\.flv($|\?)/i.test(url)
      const player = mpegts.createPlayer({ type: isFlv ? 'flv' : 'mpegts', isLive: true, url }, { enableWorker: true })
      this.mpegtsPlayer = player
      player.on(mpegts.Events.ERROR, (errType: string, errDetail: string) => {
        this.handleError(`流加载失败（${errType}/${errDetail}）`)
      })
      // 直播流加载完成即断流（源停推）→ 按错误处理走重连
      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        this.handleError('直播流已结束')
      })
      player.attachMediaElement(this.video)
      player.load()
      if (autoplay) Promise.resolve(player.play()).catch(() => {})
      return
    }
    // native（mp4/webm/未知）；以及环境不支持 MSE 时的兜底
    this.video.src = url
    if (autoplay) {
      void this.video.play().catch(() => {
        // play() 拒绝大多数由 error 事件兜底；静默忽略 AbortError（快速切台）
      })
    }
  }

  private destroyEngines(): void {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
    if (this.mpegtsPlayer) {
      try {
        this.mpegtsPlayer.destroy()
      } catch {
        /* destroy 时流可能已断开 */
      }
      this.mpegtsPlayer = null
    }
  }

  // ---------------- 事件 ----------------

  private bindNativeEvents(): void {
    this.video.addEventListener('playing', () => {
      if (this.state.status === 'connecting' || this.state.retry.attempt > 0) {
        this.patch({ status: 'playing', errorMsg: '', retry: onRetryPlaying(this.state.retry) })
      } else {
        this.patch({ status: 'playing' })
      }
    })
    this.video.addEventListener('pause', () => {
      // 切台销毁旧引擎时浏览器会异步补发 pause 事件——忽略它，防止把 connecting 翻成 paused（覆盖层闪烁）
      if (this.state.status === 'connecting') return
      this.patch({ status: 'paused' })
    })
    // video error 只在 native 引擎处理：hls/mpegts 走各自错误通道，避免双触发导致重连计数跳级
    this.video.addEventListener('error', () => {
      if (this.state.engineType === 'native') this.handleError('视频加载失败')
    })
  }

  private handleError(msg: string): void {
    const token = this.playToken
    const next = onRetryError(this.state.retry, this.autoReconnect)
    if (next.failed) {
      this.destroyEngines()
      this.patch({ status: 'failed', errorMsg: `${msg}，已重试 ${next.attempt} 次仍失败`, retry: next })
      return
    }
    this.patch({ status: 'connecting', errorMsg: '', retry: next })
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      // 等待期间用户已切台 → 放弃旧流重连
      if (token !== this.playToken || !this.state.current) return
      this.destroyEngines()
      this.startEngine(this.state.current.url, true)
    }, next.waitMs)
  }
}

export const iptvPlayerStore = new IptvPlayerStore()

/** React 订阅入口 */
export function useIptvPlayer(): PlayerState {
  return useSyncExternalStore(iptvPlayerStore.subscribe, iptvPlayerStore.getSnapshot)
}
