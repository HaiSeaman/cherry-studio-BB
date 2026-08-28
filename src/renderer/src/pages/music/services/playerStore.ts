import type { FmStatus, MusicTrack, PlayMode, RadioStation } from '../types'
import { type AudioEngine, audioEngine } from './audioEngine'
import { nextIndexInPool, prevIndexInPool, pushShuffleHistory, toFileUrl } from './playLogic'

/** 播放模式/收藏夹模式持久化在 Redux（musicSettings），主窗口经 attachPlayerStoreDeps 注入读写通道 */
export type PlayerStoreDeps = {
  getPlayMode(): PlayMode
  getFavoritesActive(): boolean
  setPlayMode(mode: PlayMode): void
  setFavoritesActive(active: boolean): void
}

const DEFAULT_DEPS: PlayerStoreDeps = {
  getPlayMode: () => 'sequential',
  getFavoritesActive: () => false,
  setPlayMode: () => {},
  setFavoritesActive: () => {}
}

export type LocalPlayerState = {
  currentId: number | null
  currentTrack: MusicTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  tip: string
}

export type FmPlayerState = {
  url: string | null
  status: FmStatus
  kbps: number
  errorMsg: string
}

const INIT_LOCAL: LocalPlayerState = {
  currentId: null,
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  tip: ''
}

const INIT_FM: FmPlayerState = { url: null, status: 'idle', kbps: 0, errorMsg: '' }

const PLAY_TIMEOUT_MS = 10_000
const ERROR_NEXT_DELAY_MS = 2_000

/** play() Promise 的良性中断（切换 src 打断上次播放等），忽略不当作错误 */
function isBenignPlayRejection(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  return e?.name === 'AbortError' || /interrupted/i.test(e?.message || '')
}

/**
 * 全局播放器状态机（本地音乐 + FM 电台）：模块级单例，页面卸载后状态与控制能力完整保留。
 * 原 useLocalPlayer / useFmPlayer 组件状态机的忠实搬运（逻辑不变，useState → 可通知的内部状态）：
 * - 三种播放模式：顺序 / 随机（历史栈上限 100）/ 单曲循环
 * - 收藏夹播放池：激活后只在收藏内切换；当前曲非收藏时播完落回收藏池
 * - 加载失败自动跳下一首，全列表失败则停止
 * - FM：play 后 10s 未进入 playing 判失败；流错误延迟 2s 自动切下一台
 * ended/error 监听直接挂在共享引擎上（替代原 autoAdvance 单例），任何页面切换下自动切歌依然生效。
 */
export class PlayerStore {
  private local: LocalPlayerState = { ...INIT_LOCAL }
  private fm: FmPlayerState = { ...INIT_FM }
  private localListeners = new Set<() => void>()
  private fmListeners = new Set<() => void>()

  private tracks: MusicTrack[] = []
  private stations: RadioStation[] = []
  private deps: PlayerStoreDeps = DEFAULT_DEPS

  private shuffleHistory: number[] = [] // 存 track id
  private loadErrorCount = 0
  private pendingReturnToFavorites = false
  private isSeeking = false
  private tipTimer: ReturnType<typeof setTimeout> | null = null

  private fmConsecutiveErrors = 0
  private fmWatchdog: ReturnType<typeof setTimeout> | null = null
  private fmErrorDelay: ReturnType<typeof setTimeout> | null = null
  /** 错误自动切台标记：自动重试不重置失败计数（否则多电台无限重试，"全部失败停止"永不触发） */
  private fmAutoAdvance = false

  constructor(private engine: AudioEngine) {
    this.bindLocalEvents()
    this.bindFmEvents()
    // FM 网速采样：仅播放中生效（1Hz，无谓渲染为零）
    setInterval(() => {
      if (this.fm.url && this.fm.status === 'playing') {
        const st = this.stations.find((s) => s.url === this.fm.url)
        const kbps = this.engine.sampleBufferedKbps(st?.bitrate || 128)
        if (kbps !== this.fm.kbps) this.patchFm({ kbps })
      }
    }, 1000)
  }

  // ---------------- 订阅（useSyncExternalStore 适配） ----------------

  subscribeLocal = (cb: () => void) => {
    this.localListeners.add(cb)
    return () => this.localListeners.delete(cb)
  }

  getLocalSnapshot = (): LocalPlayerState => this.local

  subscribeFm = (cb: () => void) => {
    this.fmListeners.add(cb)
    return () => this.fmListeners.delete(cb)
  }

  getFmSnapshot = (): FmPlayerState => this.fm

  /** 主窗口初始化时注入 Redux 读写通道（幂等）；未注入时使用默认值（测试环境） */
  attachDeps(deps: PlayerStoreDeps): void {
    this.deps = deps
  }

  private patchLocal(patch: Partial<LocalPlayerState>): void {
    this.local = { ...this.local, ...patch }
    this.localListeners.forEach((cb) => cb())
  }

  private patchFm(patch: Partial<FmPlayerState>): void {
    this.fm = { ...this.fm, ...patch }
    this.fmListeners.forEach((cb) => cb())
  }

  private notifyLocal(): void {
    this.localListeners.forEach((cb) => cb())
  }

  // ---------------- 数据供给（hooks / 挂件桥喂数据） ----------------

  setTracks(tracks: MusicTrack[]): void {
    this.tracks = tracks
    if (this.local.currentId == null) {
      // 防御性收养：引擎正在播本地曲但 store 无状态（切页返回/热重载后曲库就绪）→ 按引擎元数据恢复
      const snap = this.engine.snapshot()
      if (snap.owner === 'local' && snap.url) {
        const meta = snap.meta as { trackId?: number } | null
        const track = meta?.trackId != null ? tracks.find((t) => t.id === meta.trackId) : null
        if (track) {
          this.patchLocal({
            currentId: track.id ?? null,
            currentTrack: track,
            isPlaying: !snap.paused,
            duration: this.engine.duration,
            currentTime: this.engine.currentTime
          })
          return
        }
      }
    } else {
      // 曲库刷新（收藏/元数据变化）：同步当前曲目引用
      const cur = tracks.find((t) => t.id === this.local.currentId) ?? null
      if (cur !== this.local.currentTrack) this.patchLocal({ currentTrack: cur })
    }
  }

  setStations(stations: RadioStation[]): void {
    this.stations = stations
  }

  getStations(): RadioStation[] {
    return this.stations
  }

  getSource(): 'local' | 'fm' {
    return this.engine.snapshot().owner ?? (this.fm.url ? 'fm' : 'local')
  }

  // ---------------- 本地音乐（原 useLocalPlayer 搬运） ----------------

  showTip = (msg: string): void => {
    this.patchLocal({ tip: msg })
    if (this.tipTimer) clearTimeout(this.tipTimer)
    this.tipTimer = setTimeout(() => this.patchLocal({ tip: '' }), 3000)
  }

  private get favoriteIndices(): number[] {
    return this.tracks
      .map((t, i) => ({ t, i }))
      .filter((x) => x.t.favorite === 1)
      .map((x) => x.i)
  }

  private getPool(): number[] {
    return this.deps.getFavoritesActive() && this.favoriteIndices.length > 0
      ? this.favoriteIndices
      : this.tracks.map((_, i) => i)
  }

  /** 播放指定索引（manual=true 表示用户手动点击：随机历史重置） */
  playIndex = (index: number, manual = false): void => {
    const track = this.tracks[index]
    if (!track || track.id == null) return
    this.playTrack(track, manual)
  }

  /** 按曲目 id 播放；曲库未就绪时接受调用方提供的最小曲目信息（音乐挂件路径） */
  playTrackById(id: number, fallback?: Pick<MusicTrack, 'filePath' | 'title' | 'artist' | 'album' | 'duration'>): void {
    const track = this.tracks.find((t) => t.id === id)
    if (track) return this.playTrack(track, true)
    if (!fallback) return
    this.playTrack(
      {
        ...fallback,
        id,
        coverPath: '',
        thumbPath: '',
        size: 0,
        addedAt: 0,
        favorite: 0,
        order: 0
      },
      true
    )
  }

  private playTrack(track: MusicTrack, manual: boolean): void {
    if (track.id == null) return
    // 用户手动点播即接管播放目标：清除"播完落回收藏池"待定标记，避免单收藏池时同曲无限重播
    if (manual) this.pendingReturnToFavorites = false
    // 复位拖拽状态：防止 seek 拖拽丢失 mouseup 后进度条永久冻结
    this.isSeeking = false
    if (this.deps.getPlayMode() === 'shuffle') {
      this.shuffleHistory = manual ? [track.id] : pushShuffleHistory(this.shuffleHistory, track.id)
    }
    this.patchLocal({ currentId: track.id, currentTrack: track, currentTime: 0, duration: 0 })
    this.engine.load('local', toFileUrl(track.filePath), { trackId: track.id })
    this.engine.play().catch(() => {
      // play 拒绝由 error 事件统一处理
    })
  }

  /** 自动/手动切下一首（池内按模式选择；pendingReturn 时落回收藏池） */
  next = (): void => {
    const list = this.tracks
    if (list.length === 0) return
    let pool = this.getPool()
    let curIdx = list.findIndex((t) => t.id === this.local.currentId)
    if (this.pendingReturnToFavorites) {
      // 当前曲非收藏且已播完：从收藏池头部继续
      this.pendingReturnToFavorites = false
      curIdx = -1
      pool = this.favoriteIndices.length > 0 ? this.favoriteIndices : pool
      if (pool.length === 0) return this.stop()
    }
    if (pool.length === 0) return this.stop()
    const mode = this.deps.getPlayMode() === 'shuffle' ? 'shuffle' : 'sequential'
    const nextIdx = nextIndexInPool(pool, curIdx, mode)
    if (nextIdx < 0) return this.stop()
    this.playIndex(nextIdx)
  }

  prev = (): void => {
    const list = this.tracks
    if (list.length === 0) return
    // 随机模式优先回溯历史栈（弹出当前，回到上一曲）
    if (this.deps.getPlayMode() === 'shuffle' && this.shuffleHistory.length > 1) {
      this.shuffleHistory.pop()
      const lastId = this.shuffleHistory[this.shuffleHistory.length - 1]
      const idx = list.findIndex((t) => t.id === lastId)
      if (idx >= 0) return this.playIndex(idx)
    }
    const pool = this.getPool()
    if (pool.length === 0) return
    const curIdx = list.findIndex((t) => t.id === this.local.currentId)
    const prevIdx = prevIndexInPool(pool, curIdx)
    if (prevIdx >= 0) this.playIndex(prevIdx)
  }

  toggle = (): void => {
    if (this.local.currentId == null) {
      this.next()
      return
    }
    // 引擎被 FM 抢占后 audioEngine.paused 反映的是 FM 流状态：
    // 此时主按钮应抢回引擎重播当前曲，而不是误暂停/恢复 FM
    if (this.engine.snapshot().owner !== 'local') {
      const idx = this.tracks.findIndex((t) => t.id === this.local.currentId)
      if (idx >= 0) return this.playIndex(idx)
      return this.next()
    }
    if (this.engine.paused) {
      this.engine.play().catch(() => {})
    } else {
      this.engine.pause()
    }
  }

  seek = (time: number): void => {
    // 同上：引擎被 FM 抢占时不作用于 FM 直播流，而是抢回引擎定位到拖动位置
    if (this.engine.snapshot().owner !== 'local') {
      const idx = this.tracks.findIndex((t) => t.id === this.local.currentId)
      if (idx < 0) return
      this.playIndex(idx)
    }
    this.engine.seek(time)
    this.patchLocal({ currentTime: time })
  }

  /** 播放模式循环切换：顺序 → 随机 → 单曲 */
  togglePlayMode = (): void => {
    const order: PlayMode[] = ['sequential', 'shuffle', 'single']
    const nextMode = order[(order.indexOf(this.deps.getPlayMode()) + 1) % order.length]
    this.shuffleHistory = []
    this.deps.setPlayMode(nextMode)
  }

  /** 收藏夹播放模式：空收藏拒绝激活；当前曲非收藏 → 播完落回收藏池 */
  toggleFavoritesMode = (): void => {
    if (!this.deps.getFavoritesActive()) {
      if (this.favoriteIndices.length === 0) {
        this.showTip('暂无收藏音乐，先点击列表中的 ☆ 收藏')
        return
      }
      const curIdx = this.tracks.findIndex((t) => t.id === this.local.currentId)
      if (curIdx >= 0 && this.tracks[curIdx].favorite !== 1) {
        this.pendingReturnToFavorites = true
      }
      // 历史栈清掉非收藏曲，保证「上一首」只回溯到收藏
      this.shuffleHistory = this.shuffleHistory.filter((id) => {
        const t = this.tracks.find((x) => x.id === id)
        return t?.favorite === 1
      })
      this.deps.setFavoritesActive(true)
    } else {
      this.pendingReturnToFavorites = false
      this.deps.setFavoritesActive(false)
    }
  }

  /** 收藏模式下取消收藏当前曲：播完落回收藏池 + 清理历史栈非收藏项 */
  markPendingReturn = (): void => {
    this.pendingReturnToFavorites = true
    this.shuffleHistory = this.shuffleHistory.filter((id) => {
      const t = this.tracks.find((x) => x.id === id)
      return t?.favorite === 1
    })
  }

  /** 删除当前播放曲后接续播放原位置（prevIndex 由调用方在删除前基于旧列表捕获，规避 LiveQuery 刷新竞态） */
  onCurrentTrackDeleted = (deletedId: number, prevIndex: number): void => {
    this.engine.stop()
    this.patchLocal({ isPlaying: false })
    // 随机历史清掉被删曲，避免「上一首」回溯到已删除曲目
    this.shuffleHistory = this.shuffleHistory.filter((id) => id !== deletedId)
    const list = this.tracks.filter((t) => t.id !== deletedId)
    if (list.length === 0) {
      this.stop()
      return
    }
    const resumeIdx = Math.min(prevIndex < 0 ? 0 : prevIndex, list.length - 1)
    let targetId = list[resumeIdx]?.id
    if (targetId == null) {
      this.stop()
      return
    }
    if (this.deps.getFavoritesActive() && list[resumeIdx].favorite !== 1) {
      this.pendingReturnToFavorites = true
      // 基于删除后的实际列表重建收藏索引，避免旧索引错位
      const pool = list
        .map((t, i) => ({ t, i }))
        .filter((x) => x.t.favorite === 1)
        .map((x) => x.i)
      if (pool.length > 0) targetId = list[pool[0]].id
      else return this.stop()
    }
    // 按 id 反查当前列表索引：删除后 LiveQuery 可能尚未刷新（this.tracks 仍是旧列表），
    // 直接用 list 的索引会因偏移播到被删曲或错位曲目
    const actualIdx = this.tracks.findIndex((t) => t.id === targetId)
    if (actualIdx < 0) {
      this.stop()
      return
    }
    this.playIndex(actualIdx)
  }

  stop = (): void => {
    this.engine.stop()
    this.patchLocal({ currentId: null, currentTrack: null, isPlaying: false, currentTime: 0, duration: 0 })
  }

  setSeeking = (v: boolean): void => {
    this.isSeeking = v
  }

  /** 播放结束：单曲循环原地重播，否则自动切下一首（挂在引擎上，页面卸载后依然生效） */
  private onEnded = (): void => {
    if (this.deps.getPlayMode() === 'single' && this.local.currentId != null) {
      this.engine.seek(0)
      this.engine.play().catch(() => {})
      return
    }
    this.next()
  }

  /** 加载失败：计数累计，全列表失败则停止，否则自动跳下一首 */
  private onError = (): void => {
    if (this.local.currentId == null) return
    this.loadErrorCount += 1
    if (this.loadErrorCount >= this.tracks.length) {
      this.loadErrorCount = 0
      this.stop()
      this.showTip('全部曲目均无法播放')
      return
    }
    this.next()
  }

  private bindLocalEvents(): void {
    this.engine.on('local', 'loadedmetadata', () => {
      this.patchLocal({ duration: this.engine.duration })
    })
    this.engine.on('local', 'timeupdate', () => {
      // 进度节流：整秒变化才触发 React 渲染（timeupdate 原生 ~4Hz，整秒变化仅 1Hz），
      // 避免播放期间高频重建 UI 组件树（实测 4Hz 全量重渲染可占 ~3% CPU）
      if (!this.isSeeking) {
        const t = this.engine.currentTime
        if (Math.floor(this.local.currentTime) !== Math.floor(t)) this.patchLocal({ currentTime: t })
      }
    })
    this.engine.on('local', 'play', () => this.patchLocal({ isPlaying: true }))
    this.engine.on('local', 'pause', () => this.patchLocal({ isPlaying: false }))
    this.engine.on('local', 'playing', () => {
      this.loadErrorCount = 0
    })
    this.engine.on('local', 'ended', () => this.onEnded())
    this.engine.on('local', 'error', () => this.onError())
    this.engine.onStop('local', () => {
      this.patchLocal({ isPlaying: false, currentTime: 0 })
    })
  }

  // ---------------- FM 电台（原 useFmPlayer 搬运） ----------------

  fmPlay = (url: string): void => {
    this.fmClearTimers()
    this.patchFm({ errorMsg: '' })
    if (!this.fmAutoAdvance) this.fmConsecutiveErrors = 0
    this.fmAutoAdvance = false
    this.patchFm({ url, status: 'connecting' })
    this.engine.load('fm', url)
    this.engine.play().catch((err) => {
      if (!isBenignPlayRejection(err)) this.fmHandleStreamError()
    })
    this.fmWatchdog = setTimeout(() => {
      this.fmWatchdog = null
      if (this.fm.url === url) {
        this.engine.pause()
        this.fmHandleStreamError()
      }
    }, PLAY_TIMEOUT_MS)
  }

  fmNext = (): void => {
    const list = this.stations
    if (list.length === 0) return
    const idx = list.findIndex((s) => s.url === this.fm.url)
    const nextIdx = idx < 0 ? 0 : (idx + 1) % list.length
    this.fmPlay(list[nextIdx].url)
  }

  fmPrev = (): void => {
    const list = this.stations
    if (list.length === 0) return
    const idx = list.findIndex((s) => s.url === this.fm.url)
    const prevIdx = idx < 0 ? 0 : (idx - 1 + list.length) % list.length
    this.fmPlay(list[prevIdx].url)
  }

  fmToggle = (): void => {
    const { status } = this.fm
    if (status === 'playing') {
      this.fmClearTimers()
      this.engine.pause()
      this.patchFm({ status: 'paused' })
      return
    }
    if (status === 'paused' && this.fm.url) {
      this.fmClearTimers()
      // 手动恢复清零失败计数（避免历史连续失败把这次恢复误判为"全部失败"）
      this.fmConsecutiveErrors = 0
      this.fmAutoAdvance = false
      this.patchFm({ status: 'connecting' })
      this.engine.play().catch((err) => {
        if (!isBenignPlayRejection(err)) this.fmHandleStreamError()
      })
      this.fmWatchdog = setTimeout(() => {
        this.fmWatchdog = null
        this.fmHandleStreamError()
      }, PLAY_TIMEOUT_MS)
      return
    }
    this.fmNext()
  }

  private fmHandleStreamError(): void {
    const list = this.stations
    this.fmConsecutiveErrors += 1
    this.fmClearTimers()
    if (list.length === 0 || this.fmConsecutiveErrors >= list.length) {
      this.patchFm({ status: 'error', errorMsg: '所有电台无法连接，请检查网络后重试' })
      this.patchFm({ url: null })
      this.engine.stop()
      return
    }
    this.patchFm({ status: 'error' })
    this.fmErrorDelay = setTimeout(() => {
      this.fmErrorDelay = null
      this.fmAutoAdvance = true
      this.fmNext()
    }, ERROR_NEXT_DELAY_MS)
  }

  private fmClearTimers(): void {
    if (this.fmWatchdog) clearTimeout(this.fmWatchdog)
    this.fmWatchdog = null
    if (this.fmErrorDelay) clearTimeout(this.fmErrorDelay)
    this.fmErrorDelay = null
  }

  private bindFmEvents(): void {
    this.engine.on('fm', 'playing', () => {
      this.fmConsecutiveErrors = 0
      if (this.fmWatchdog) clearTimeout(this.fmWatchdog)
      this.fmWatchdog = null
      this.patchFm({ status: 'playing', errorMsg: '' })
    })
    this.engine.on('fm', 'pause', () => {
      if (this.fm.status === 'playing') this.patchFm({ status: 'paused' })
    })
    this.engine.on('fm', 'error', () => {
      if (this.fm.url) this.fmHandleStreamError()
    })
    this.engine.on('fm', 'waiting', () => {
      if (this.fm.status === 'playing') this.patchFm({ status: 'connecting' })
    })
    this.engine.onStop('fm', () => {
      this.fmClearTimers()
      this.patchFm({ status: 'idle', url: null, kbps: 0 })
    })
  }

  /** 仅供测试：复位全部状态（生产代码勿用） */
  resetForTest(): void {
    this.local = { ...INIT_LOCAL }
    this.fm = { ...INIT_FM }
    this.tracks = []
    this.stations = []
    this.shuffleHistory = []
    this.loadErrorCount = 0
    this.pendingReturnToFavorites = false
    this.isSeeking = false
    this.fmConsecutiveErrors = 0
    this.fmAutoAdvance = false
    this.fmClearTimers()
    if (this.tipTimer) clearTimeout(this.tipTimer)
    this.tipTimer = null
    this.notifyLocal()
    this.fmListeners.forEach((cb) => cb())
  }
}

export const playerStore = new PlayerStore(audioEngine)
