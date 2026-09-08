import { db } from '@renderer/databases'
import { useEffect, useSyncExternalStore } from 'react'

import type { HubAlarm } from '../types'
import { alarmSounds } from './alarmSounds'
import { ALARM_FIRE_WINDOW_SEC, computeDueAlarms, pad2 } from './schedule'

export type RingingInfo = { label: string; sound: string; fromTimer?: boolean }

/**
 * 应用级闹钟调度单例（AlarmEngineHost 挂在 Router 根，任何页面都保持运行）：
 * 每秒检查（90 秒补触发窗口 + 睡眠唤醒 gap 补响 / 跨天重置 / 日历 date 过滤），
 * 重进页面经订阅恢复响铃状态，响铃横幅全局渲染。
 */
class AlarmScheduler {
  private alarms: HubAlarm[] = []
  private lastCheckDate = ''
  /** 上一条 tick 的墙钟时间戳：相邻 tick 间隔远超 1 秒 = 经历了系统睡眠/定时器冻结 → 扩大补响窗口 */
  private lastTickAt = 0
  /** 当日已触发过的 alarmKey 集合：即使内存数据被 liveQuery 旧快照覆盖，也不会同日重复入队（跨天清空） */
  private firedKeys = new Set<string>()
  private currentRinging: RingingInfo | null = null
  /** 同一 tick 内多个闹钟到期（90 秒补触发窗口内可能同时命中多个）：排队依次响；用户点「关闭闹钟」时整批清空 */
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

  /** 仅测试用：清空调度器全部内部状态（模块级单例跨用例残留） */
  resetForTest(): void {
    this.alarms = []
    this.lastCheckDate = ''
    this.lastTickAt = 0
    this.firedKeys.clear()
    this.currentRinging = null
    this.ringQueue = []
  }

  stopRinging(): void {
    alarmSounds.stop()
    this.currentRinging = null
    // 用户点「关闭闹钟」= 要求安静：同批排队的闹钟一并清空，不再接力响下一个
    // （否则点一次只是换下一个接着响，两个关闭按钮看起来都毫无反应）
    this.ringQueue = []
    this.emit()
  }

  /** 倒计时结束等外部触发 */
  fireExternal(label: string, sound: string): void {
    this.startRinging({ label, sound, fromTimer: true }, '倒计时结束', label.trim() || '你的倒计时已完成！')
  }

  private startRinging(info: RingingInfo, title: string, body: string): void {
    this.currentRinging = info
    try {
      alarmSounds.start(info.sound || 'default')
    } catch {
      // 无音频设备/Context 创建失败等环境异常：横幅照常显示，不影响停止流程
    }
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
    // 相邻 tick 间隔远超 1 秒 = 系统睡眠过/定时器被长期节流：把触发窗口扩到 gap，
    // 睡眠期间到点的闹钟在唤醒后第一条 tick 补响（仅限今天，跨天闹钟由 dateKey 天然排除）
    const nowMs = now.getTime()
    const gapSec = this.lastTickAt > 0 ? Math.max(0, Math.floor((nowMs - this.lastTickAt) / 1000)) : 0
    this.lastTickAt = nowMs
    const result = computeDueAlarms(this.alarms, now, this.lastCheckDate, Math.max(ALARM_FIRE_WINDOW_SEC, gapSec))
    this.lastCheckDate = result.todayKey

    if (result.crossedDay) {
      // 新的一天：清除全部 triggered，让闹钟今天能再次响
      this.firedKeys.clear()
      void db.hub_alarms
        .toCollection()
        .modify({ triggered: false, lastTriggerKey: undefined })
        .catch(() => {})
    }

    if (result.toFire.length > 0) {
      // 当日已触发集合兜底去重：liveQuery 旧快照经 setAlarms 覆盖内存标记时，同一天也不得重复响
      const fresh = result.toFire.filter((a) => a.lastTriggerKey == null || !this.firedKeys.has(a.lastTriggerKey))
      if (fresh.length === 0) return
      for (const a of fresh) {
        if (a.lastTriggerKey) this.firedKeys.add(a.lastTriggerKey)
        if (a.id != null) {
          // 记录已被用户删除时 update resolve(0)；表异常时 reject —— 吞掉避免 unhandled rejection
          void db.hub_alarms.update(a.id, { triggered: true, lastTriggerKey: a.lastTriggerKey }).catch(() => {})
        }
      }
      // 立即把触发标记合并进内存，不等页面 liveQuery 回流：
      // 否则页面未刷新/已卸载时，同一闹钟在 90 秒窗口内每秒重复入队，关闭后立刻又响
      const firedById = new Map(fresh.filter((a) => a.id != null).map((a) => [a.id, a]))
      this.alarms = this.alarms.map((a) => (a.id != null ? (firedById.get(a.id) ?? a) : a))
      // 当前无闹钟在响 → 立即响第一个；其余排队（用户点关闭时整批清空）
      this.ringQueue.push(...fresh)
      if (!this.currentRinging) this.ringNext()
    }
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb())
  }
}

export const alarmScheduler = new AlarmScheduler()

/** AlarmEngineHost（Router 根常驻）挂载一次：同步闹钟数据 + 启动全局定时器；响铃状态经订阅分发 */
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
