export type AudioOwner = 'local' | 'fm'

type ListenerEntry = { owner: AudioOwner; type: string; wrapped: EventListener }

/**
 * 全局唯一 <audio> 播放引擎：本地音乐与 FM 电台互斥播放。
 * 一方 claim 时，另一方的事件回调被移除并触发其 onStop（用于状态复位）。
 * FM 直播流（Icecast/Shoutcast）无 CORS 头，因此不设置 crossOrigin；preload='none'。
 */
export class AudioEngine {
  private el: HTMLAudioElement
  private owner: AudioOwner | null = null
  private listeners: ListenerEntry[] = []
  private stopHandlers: Partial<Record<AudioOwner, () => void>> = {}
  private lastBufferedEnd = 0
  private lastSampleAt = 0
  private lastKbps = 0
  private ownerMeta: unknown = null

  constructor() {
    this.el = new Audio()
    this.el.preload = 'none'
  }

  /** 引擎快照：owner 方可在组件重新挂载时恢复播放状态（页面卸载后引擎继续播放） */
  snapshot(): { owner: AudioOwner | null; url: string; paused: boolean; meta: unknown } {
    return { owner: this.owner, url: this.el.src || '', paused: this.el.paused, meta: this.owner ? this.ownerMeta : null }
  }

  /** 取得引擎归属；若另一方正在使用，先将其停掉并复位其回调 */
  claim(owner: AudioOwner): void {
    if (this.owner === owner) return
    if (this.owner) {
      const prev = this.owner
      this.offOwner(prev)
      this.el.pause()
      this.el.removeAttribute('src')
      this.el.load()
      this.stopHandlers[prev]?.()
    }
    this.owner = owner
    this.resetBufferSample()
  }

  load(owner: AudioOwner, url: string, meta?: unknown): void {
    this.claim(owner)
    this.ownerMeta = meta ?? null
    if (this.el.src !== url) {
      this.el.src = url
      this.resetBufferSample()
    }
  }

  async play(): Promise<void> {
    await this.el.play()
  }

  pause(): void {
    this.el.pause()
  }

  stop(): void {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    this.resetBufferSample()
  }

  seek(time: number): void {
    const d = this.el.duration
    if (Number.isFinite(d) && d > 0) {
      this.el.currentTime = Math.min(Math.max(time, 0), d)
    } else {
      this.el.currentTime = Math.max(time, 0)
    }
  }

  get currentTime(): number {
    return this.el.currentTime || 0
  }

  get duration(): number {
    const d = this.el.duration
    return Number.isFinite(d) ? d : 0
  }

  get paused(): boolean {
    return this.el.paused
  }

  setVolume(volume: number): void {
    this.el.volume = Math.min(Math.max(volume, 0), 100) / 100
  }

  /** 订阅 audio 元素事件；claim 切换时非当前 owner 的回调会被自动移除 */
  on(owner: AudioOwner, type: string, cb: () => void): () => void {
    const wrapped: EventListener = () => cb()
    this.el.addEventListener(type, wrapped)
    const entry: ListenerEntry = { owner, type, wrapped }
    this.listeners.push(entry)
    return () => {
      this.el.removeEventListener(type, wrapped)
      this.listeners = this.listeners.filter((l) => l !== entry)
    }
  }

  /** 被另一方抢占播放权时的回调（用于该方 UI 状态复位）；传 null 清除 */
  onStop(owner: AudioOwner, cb: (() => void) | null): void {
    if (cb === null) delete this.stopHandlers[owner]
    else this.stopHandlers[owner] = cb
  }

  /**
   * 网速采样（FM 状态栏 KB/s 显示）：buffered 末端增量 / 时间差。
   * 无缓冲进展时回退上次采样值或按码率估算（128kbps ≈ 16KB/s）。
   */
  sampleBufferedKbps(fallbackBps = 128): number {
    let end = 0
    try {
      if (this.el.buffered.length > 0) {
        end = this.el.buffered.end(this.el.buffered.length - 1)
      }
    } catch {
      end = 0
    }
    const now = Date.now()
    const dt = (now - this.lastSampleAt) / 1000
    if (dt >= 0.5) {
      if (end > this.lastBufferedEnd && this.lastSampleAt > 0) {
        this.lastKbps = Math.round((end - this.lastBufferedEnd) / dt / 1024)
      }
      this.lastBufferedEnd = end
      this.lastSampleAt = now
    }
    return this.lastKbps || Math.max(1, Math.round(fallbackBps / 8))
  }

  private resetBufferSample(): void {
    this.lastBufferedEnd = 0
    this.lastSampleAt = 0
    this.lastKbps = 0
  }

  private offOwner(owner: AudioOwner): void {
    for (const l of this.listeners) {
      if (l.owner === owner) {
        this.el.removeEventListener(l.type, l.wrapped)
      }
    }
    this.listeners = this.listeners.filter((l) => l.owner !== owner)
  }
}

export const audioEngine = new AudioEngine()
