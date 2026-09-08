import { useSyncExternalStore } from 'react'

import { alarmScheduler } from './alarmScheduler'

export type CountdownState = {
  remainSec: number
  totalSec: number
  running: boolean
}

/**
 * 倒计时引擎（应用级单例）：
 * interval 与全部状态都在模块层，不随 AlarmPanel 卸载清理——切到其他页面倒计时照走、归零照响。
 * （此前倒计时挂在组件 state 上，离开便签页时 useEffect cleanup 把 interval 清掉、状态全丢，
 * 倒计时被静默杀掉，表现就是"倒计时不响"。）
 * 归零后走全局闹钟调度器 fireExternal：响铃 + 系统通知 + 唤起主窗口，与定时闹钟同一引擎。
 */
class CountdownEngine {
  private remainSec = 0
  private totalSec = 0
  private running = false
  private endTs = 0
  private label = ''
  private sound = 'default'
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<() => void>()
  private snapshot: CountdownState = { remainSec: 0, totalSec: 0, running: false }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** useSyncExternalStore 快照：引用稳定，仅状态变化时重建 */
  getState = (): CountdownState => this.snapshot

  start(h: number, m: number, s: number, label = '', sound = 'default'): void {
    const total = Math.max(1, Math.round(h * 3600 + m * 60 + s))
    this.totalSec = total
    this.remainSec = total
    this.endTs = Date.now() + total * 1000
    this.label = label
    this.sound = sound
    this.running = true
    this.stopTick()
    this.timer = setInterval(this.tick, 250)
    this.commit()
  }

  pause(): void {
    if (!this.running) return
    this.stopTick()
    this.running = false
    this.commit()
  }

  resume(): void {
    if (this.running || this.remainSec <= 0) return
    // 时间戳法防系统休眠漂移：恢复时以剩余秒数重算截止时刻
    this.endTs = Date.now() + this.remainSec * 1000
    this.running = true
    this.stopTick()
    this.timer = setInterval(this.tick, 250)
    this.commit()
  }

  reset(): void {
    this.stopTick()
    this.running = false
    this.remainSec = 0
    this.totalSec = 0
    this.endTs = 0
    this.label = ''
    this.sound = 'default'
    this.commit()
  }

  private stopTick(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick = (): void => {
    const remain = Math.max(0, Math.round((this.endTs - Date.now()) / 1000))
    if (remain !== this.remainSec) {
      this.remainSec = remain
      this.commit()
    }
    if (remain <= 0) {
      this.stopTick()
      this.running = false
      this.endTs = 0
      this.commit()
      alarmScheduler.fireExternal(this.label, this.sound)
    }
  }

  private commit(): void {
    this.snapshot = { remainSec: this.remainSec, totalSec: this.totalSec, running: this.running }
    this.emit()
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb())
  }
}

export const countdownEngine = new CountdownEngine()

/**
 * AlarmPanel 订阅入口：接口形状与旧版 useCountdown 保持一致
 * （差异：start 额外接收可选 label/sound 快照，归零回调由引擎在模块层触发，不再依赖组件存活）
 */
export function useCountdown() {
  const state = useSyncExternalStore(countdownEngine.subscribe, countdownEngine.getState, countdownEngine.getState)
  return {
    remainSec: state.remainSec,
    totalSec: state.totalSec,
    running: state.running,
    start: (h: number, m: number, s: number, label?: string, sound?: string) =>
      countdownEngine.start(h, m, s, label, sound),
    pause: () => countdownEngine.pause(),
    resume: () => countdownEngine.resume(),
    reset: () => countdownEngine.reset()
  }
}
