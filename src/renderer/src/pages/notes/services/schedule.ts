import type { HubAlarm } from '../types'

/** 补触发窗口：错过整秒（如系统休眠）也能在 90 秒内补响 */
export const ALARM_FIRE_WINDOW_SEC = 90

export type DueResult = {
  toFire: HubAlarm[]
  crossedDay: boolean
  todayKey: string
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 本地时区日期时间 YYYY-MM-DD HH:mm(:ss)（notes 模块统一格式化） */
export function formatDateTime(t: number, withSeconds = false): string {
  const d = new Date(t)
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return withSeconds ? `${base}:${pad2(d.getSeconds())}` : base
}

export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function alarmKey(dateKey: string, h: number, m: number, s: number): string {
  return `${dateKey}-${h}-${m}-${s}`
}

/**
 * 每秒调度核心（纯函数，便于单测）：
 * - 跨天（lastCheckDate ≠ 今天）→ crossedDay=true，调用方负责清全部 triggered
 * - 日历闹钟（date 字段）仅在指定日期触发
 * - 触发窗口 = alarmSec ≤ nowSec ≤ alarmSec + 90
 * - lastTriggerKey 命中过当天该时刻则跳过（防同秒重复）
 * 返回副本（triggered=true + lastTriggerKey），不修改入参数组
 */
export function computeDueAlarms(alarms: HubAlarm[], now: Date, lastCheckDate: string): DueResult {
  const todayKey = dateKeyOf(now)
  const crossedDay = lastCheckDate !== '' && lastCheckDate !== todayKey
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  const toFire: HubAlarm[] = []

  for (const a of alarms) {
    if (!a.enabled) continue
    if (a.date && a.date !== todayKey) continue
    const key = alarmKey(todayKey, a.h, a.m, a.s || 0)
    if (a.lastTriggerKey === key) continue
    const alarmSec = a.h * 3600 + a.m * 60 + (a.s || 0)
    if (nowSec >= alarmSec && nowSec - alarmSec <= ALARM_FIRE_WINDOW_SEC) {
      toFire.push({ ...a, triggered: true, lastTriggerKey: key })
    }
  }
  return { toFire, crossedDay, todayKey }
}

/** 距下次响铃秒数（列表「X 分 Y 秒后」提示）；disabled 或日历日期已过 → null */
export function nextRingInfo(a: HubAlarm, now: Date): number | null {
  if (!a.enabled) return null
  const todayKey = dateKeyOf(now)
  if (a.date && a.date < todayKey) return null

  const alarmSec = a.h * 3600 + a.m * 60 + (a.s || 0)
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  if (a.date) {
    // 日历闹钟单日触发：今天已过到点 → 永不响（不按"明天"倒计时误导）
    return alarmSec > nowSec ? alarmSec - nowSec : null
  }
  return alarmSec > nowSec ? alarmSec - nowSec : 24 * 3600 - nowSec + alarmSec // 无 date：今天已过按明天
}
