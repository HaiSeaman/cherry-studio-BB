/**
 * 音乐挂件 ↔ 主窗口消息协议（纯类型，零运行时依赖；主窗口侧与挂件侧共用）。
 * 传输走主进程中转 IPC（见 preload musicWidget.postToHost / postToWidget），
 * 未用 BroadcastChannel：file:// 生产模式下跨窗口可用性无法离线验证，IPC 中转是保证可用的降级路径。
 */
import type { FmStatus, PlayMode, RadioStation } from '../../pages/music/types'

/** 挂件展示用的曲目精简信息 */
export type WidgetTrack = {
  id: number
  title: string
  artist: string
  album: string
  duration: number
}

export type WidgetFmState = {
  url: string
  status: FmStatus
  kbps: number
  errorMsg: string
}

/** 主窗口 → 挂件的全量播放状态（update 为全量覆盖，snapshot 额外带电台列表） */
export type WidgetPlayerState = {
  source: 'local' | 'fm'
  /** 当前活跃源（本地或 FM）是否正在播放 */
  playing: boolean
  /** 本地音乐自身的播放态（FM 播放中切回本地视图时，播放键/频谱不应显示 FM 的状态） */
  localPlaying: boolean
  track: WidgetTrack | null
  position: number
  duration: number
  volume: number
  playMode: PlayMode
  fm: WidgetFmState | null
}

/** 挂件 → 主窗口的命令载荷 */
export type WidgetCmd =
  | { t: 'cmd'; a: 'togglePlay' | 'next' | 'prev' | 'togglePlayMode' | 'fmToggle' }
  | { t: 'cmd'; a: 'seek'; v: number }
  | { t: 'cmd'; a: 'volume'; v: number }
  | { t: 'cmd'; a: 'playTrack'; id: number; filePath: string }
  | { t: 'cmd'; a: 'playFm'; url: string }

export type WidgetMsg =
  | { t: 'snapshot:req' }
  | { t: 'snapshot'; s: WidgetPlayerState; stations: RadioStation[] }
  | { t: 'update'; s: WidgetPlayerState }
  | { t: 'pos'; p: number; d: number }
  | WidgetCmd
