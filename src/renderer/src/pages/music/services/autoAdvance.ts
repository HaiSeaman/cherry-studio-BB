import { audioEngine } from './audioEngine'

interface AutoAdvanceHandlers {
  /** 播放结束（单曲循环由调用方自行处理） */
  onEnded: () => void
  /** 加载/解码错误（调用方负责错误计数与接续策略） */
  onError: () => void
}

let handler: AutoAdvanceHandlers | null = null
let subscribed = false

/**
 * 后台自动切歌单例：ended/error 监听与页面生命周期解耦。
 * 音乐页卸载（切走其他 TAB）后引擎继续播放，本单例保持监听，
 * 歌曲播完仍会调用最近一次注册的回调自动切下一首；
 * 重新回到音乐页时注册新回调刷新引用（见 useLocalPlayer）。
 */
export function registerAutoAdvance(h: AutoAdvanceHandlers | null): void {
  handler = h
  if (!h || subscribed) return
  subscribed = true
  audioEngine.on('local', 'ended', () => handler?.onEnded())
  audioEngine.on('local', 'error', () => handler?.onError())
}
