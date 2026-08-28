import { describe, expect, it } from 'vitest'

import { addMonths, monthDays, monthRange, todayISO, toISODate, weekdayOf } from '../services/calendar'

describe('toISODate', () => {
  it('本地时区 YYYY-MM-DD（补零）', () => {
    expect(toISODate(new Date(2026, 7, 16, 23, 59, 59))).toBe('2026-08-16')
    expect(toISODate(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('todayISO', () => {
  it('返回今天且格式合法', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('monthDays', () => {
  it('2026 年 2 月 28 天、闰年 2028 年 2 月 29 天', () => {
    expect(monthDays(2026, 2, '2026-08-28')).toHaveLength(28)
    expect(monthDays(2028, 2, '2028-02-15')).toHaveLength(29)
  })
  it('大月 31 天、小月 30 天', () => {
    expect(monthDays(2026, 8, '2026-08-28')).toHaveLength(31)
    expect(monthDays(2026, 4, '2026-08-28')).toHaveLength(30)
  })
  it('isToday/isFuture 标记正确', () => {
    const days = monthDays(2026, 8, '2026-08-28')
    expect(days.find((d) => d.day === 28)?.isToday).toBe(true)
    expect(days.find((d) => d.day === 29)?.isFuture).toBe(true)
    expect(days.find((d) => d.day === 27)?.isFuture).toBe(false)
    expect(days.find((d) => d.day === 27)?.isToday).toBe(false)
  })
  it('day 与 date 对应', () => {
    const days = monthDays(2026, 8, '2026-08-28')
    expect(days[0]).toEqual({ date: '2026-08-01', day: 1, isToday: false, isFuture: false })
    expect(days[30].date).toBe('2026-08-31')
  })
})

describe('monthRange', () => {
  it('首尾含当日', () => {
    expect(monthRange(2026, 8)).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('addMonths', () => {
  it('跨年回绕', () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths(2025, 12, 1)).toEqual({ year: 2026, month: 1 })
  })
  it('同年内平移', () => {
    expect(addMonths(2026, 8, -1)).toEqual({ year: 2026, month: 7 })
    expect(addMonths(2026, 8, 2)).toEqual({ year: 2026, month: 10 })
  })
})

describe('weekdayOf', () => {
  it('2026-08-01 是周六(6)、08-02 是周日(0)', () => {
    expect(weekdayOf('2026-08-01')).toBe(6)
    expect(weekdayOf('2026-08-02')).toBe(0)
  })
})
