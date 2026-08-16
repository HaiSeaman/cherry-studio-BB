import { db } from '@renderer/databases'
import { useEffect, useSyncExternalStore } from 'react'

import type { HubAlarm } from '../types'
import { alarmSounds } from './alarmSounds'
import { computeDueAlarms, pad2 } from './schedule'

export type RingingInfo = { label: string; sound: string; fromTimer?: boolean }

/**
 * 应用级闹钟调度单例：每秒检查（90 秒补触发窗口/跨天重置/日历 date 过滤），
 * 页面卸载后仍持续运行（离开闹钟便签页闹钟照常响），重进页面经订阅恢复响铃状态。
 */
class AlarmScheduler {
  private alarms: HubAlarm[] = []
  private lastCheckDate = ''
  private currentRinging: RingingInfo | null = null
  /** 同一 tick 内多个闹钟到期（90 秒补触发窗口内可能同时命中多个）：排队，停止当前后逐个响 */
  private ringQueue: HubAlarm[] = []
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null

  /** 页面每次 alarms 变化时同步给调度器；首次调用启动全局定时器 */
  setAlarms(alarms: HubAlarm[]): void {
    this.alarms = alarms
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 1000)
    }
    this.emit()
  }

  getRinging(): RingingInfo | null {
    return this.currentRinging
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  stopRinging(): void {
    alarmSounds.stop()
    this.currentRinging = null
    this.emit()
    // 同批到期的闹钟还有排队：继续响下一个
    this.ringNext()
  }

  /** 倒计时结束等外部触发 */
  fireExternal(label: string, sound: string): void {
    this.startRinging({ label, sound, fromTimer: true }, '倒计时结束', label.trim() || '你的倒计时已完成！')
  }

  private startRinging(info: RingingInfo, title: string, body: string): void {
    this.currentRinging = info
    alarmSounds.start(info.sound || 'default')
    try {
      new Notification(title, { body, silent: true })
    } catch {
      // 通知失败不影响响铃
    }
    if (document.hidden) void window.api.window.focus()
    this.emit()
  }

  /** 从队列取一个闹钟开始响铃（无则返回） */
  private ringNext(): void {
    const next = this.ringQueue.shift()
    if (!next) return
    const timeText = `${pad2(next.h)}:${pad2(next.m)}:${pad2(next.s)}`
    this.startRinging(
      { label: next.label, sound: next.sound },
      '闹钟响铃',
      `${timeText}${next.label ? ` · ${next.label}` : ''}`
    )
  }

  private tick(): void {
    const now = new Date()
    const result = computeDueAlarms(this.alarms, now, this.lastCheckDate)
    this.lastCheckDate = result.todayKey

    if (result.crossedDay) {
      // 新的一天：清除全部 triggered，让闹钟今天能再次响
      void db.hub_alarms.toCollection().modify({ triggered: false, lastTriggerKey: undefined })
    }

    if (result.toFire.length > 0) {
      for (const a of result.toFire) {
        if (a.id != null) {
          void db.hub_alarms.update(a.id, { triggered: true, lastTriggerKey: a.lastTriggerKey })
        }
      }
      // 当前无闹钟在响 → 立即响第一个；其余排队，停止当前后逐个响（修复：只响第一个其余静默失效）
      this.ringQueue.push(...result.toFire)
      if (!this.currentRinging) this.ringNext()
    }
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb())
  }
}

export const alarmScheduler = new AlarmScheduler()

/** NotesPage 顶层挂载一次：同步闹钟数据 + 订阅响铃状态 */
export function useAlarmEngine(alarms: HubAlarm[]) {
  useEffect(() => {
    alarmScheduler.setAlarms(alarms)
  }, [alarms])

  const ringing = useSyncExternalStore(
    alarmScheduler.subscribe,
    () => alarmScheduler.getRinging(),
    () => null
  )

  return { ringing, stopRinging: () => alarmScheduler.stopRinging() }
}
