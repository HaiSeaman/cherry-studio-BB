import type { WidgetMsg } from './protocol'

/** 挂件 → 主窗口命令发送 */
export function sendCmd(msg: WidgetMsg): void {
  window.api.musicWidget.postToHost(msg)
}

/** 主窗口消息订阅（snapshot / update / pos） */
export function onHostMessage(cb: (msg: WidgetMsg) => void): () => void {
  return window.api.musicWidget.onMessage((msg) => cb(msg as WidgetMsg))
}

/**
 * 进度直更通道：position 4/s 高频到达，绕过 React 状态直写 DOM（ref 绑定），
 * 避免主组件树重渲染；拖动进度条时由视图层置 dragging 暂停外部写入。
 */
type PosListener = (p: number, d: number) => void
const posListeners = new Set<PosListener>()

export function emitPosition(p: number, d: number): void {
  posListeners.forEach((cb) => cb(p, d))
}

export function onPosition(cb: PosListener): () => void {
  posListeners.add(cb)
  return () => posListeners.delete(cb)
}
