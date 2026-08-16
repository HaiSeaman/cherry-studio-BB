import { describe, expect, it } from 'vitest'

import type { HubAlarm } from '../types'
import { alarmKey, computeDueAlarms, nextRingInfo } from '../services/schedule'

const alarm = (partial: Partial<HubAlarm>): HubAlarm => ({
  id: 1,
  h: 9,
  m: 0,
  s: 0,
  enabled: true,
  triggered: false,
  label: '',
  sound: 'default',
  ...partial
})

const at = (iso: string, h: number, m: number, s: number) => new Date(`${iso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)

describe('computeDueAlarms', () => {
  it('进入 90 秒触发窗口即命中（89s 命中 / 91s 不命中）', () => {
    const a = alarm({ h: 9, m: 0, s: 0 })
    const hit = computeDueAlarms([a], at('2026-08-16', 9, 1, 29), '2026-08-15')
    expect(hit.toFire.map((x) => x.id)).toEqual([1])

    const miss = computeDueAlarms([a], at('2026-08-16', 9, 1, 31), '2026-08-15')
    expect(miss.toFire).toHaveLength(0)
  })

  it('当前秒等于闹钟时刻命中；未来时刻不命中', () => {
    const a = alarm({ h: 8, m: 59, s: 59 })
    expect(computeDueAlarms([a], at('2026-08-16', 8, 59, 59), '2026-08-15').toFire).toHaveLength(1)
    expect(computeDueAlarms([a], at('2026-08-16', 8, 59, 58), '2026-08-15').toFire).toHaveLength(0)
  })

  it('日历闹钟（date 字段）仅在指定日期触发', () => {
    const a = alarm({ h: 9, m: 0, s: 0, date: '2026-08-20' })
    expect(computeDueAlarms([a], at('2026-08-16', 9, 0, 5), '2026-08-15').toFire).toHaveLength(0)
    expect(computeDueAlarms([a], at('2026-08-20', 9, 0, 5), '2026-08-19').toFire).toHaveLength(1)
  })

  it('disabled 跳过；lastTriggerKey 相同跳过（防同秒重复）', () => {
    expect(computeDueAlarms([alarm({ enabled: false })], at('2026-08-16', 9, 0, 0), '2026-08-15').toFire).toHaveLength(0)
    const fired = alarm({ lastTriggerKey: '2026-08-16-9-0-0' })
    expect(computeDueAlarms([fired], at('2026-08-16', 9, 0, 0), '2026-08-15').toFire).toHaveLength(0)
  })

  it('跨天返回 crossedDay（调用方负责清 triggered），未跨天为 false', () => {
    const r1 = computeDueAlarms([], at('2026-08-16', 0, 0, 5), '2026-08-15')
    expect(r1.crossedDay).toBe(true)
    const r2 = computeDueAlarms([], at('2026-08-16', 12, 0, 5), '2026-08-16')
    expect(r2.crossedDay).toBe(false)
    expect(r2.todayKey).toBe('2026-08-16')
  })

  it('命中的闹钟带 triggered=true 与 lastTriggerKey（返回副本不改原数组）', () => {
    const a = alarm({ id: 7, h: 10, m: 30, s: 0 })
    const r = computeDueAlarms([a], at('2026-08-16', 10, 30, 10), '2026-08-15')
    expect(r.toFire[0].triggered).toBe(true)
    expect(r.toFire[0].lastTriggerKey).toBe('2026-08-16-10-30-0')
    expect(a.triggered).toBe(false)
  })
})

describe('alarmKey', () => {
  it('格式 date-h-m-s', () => {
    expect(alarmKey('2026-08-16', 9, 5, 3)).toBe('2026-08-16-9-5-3')
  })
})

describe('nextRingInfo', () => {
  it('今天未到 → 差值秒数；今天已过且无 date → 按明天同一时刻计算', () => {
    const a = alarm({ h: 10, m: 0, s: 0 })
    expect(nextRingInfo(a, at('2026-08-16', 9, 59, 0))).toBe(60)
    expect(nextRingInfo(a, at('2026-08-16', 10, 0, 30))).toBe(24 * 3600 - 30)
  })

  it('disabled / date 已过去 → null；date 是未来 → 按当日时刻差值', () => {
    expect(nextRingInfo(alarm({ enabled: false }), at('2026-08-16', 9, 0, 0))).toBeNull()
    expect(nextRingInfo(alarm({ date: '2026-08-10', h: 9 }), at('2026-08-16', 9, 0, 0))).toBeNull()
    expect(nextRingInfo(alarm({ date: '2026-08-16', h: 12 }), at('2026-08-16', 11, 0, 0))).toBe(3600)
  })
})
