import { describe, expect, it } from 'vitest'

import { buildMonthCells, heatmapRange, hmLevel, toISODate } from '../services/calendarUtils'

describe('toISODate', () => {
  it('本地时区 YYYY-MM-DD（补零）', () => {
    expect(toISODate(new Date(2026, 7, 16, 23, 59, 59))).toBe('2026-08-16')
    expect(toISODate(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('hmLevel', () => {
  it('0→0 / 1→1 / ≤3→2 / ≤6→3 / >6→4', () => {
    expect(hmLevel(0)).toBe(0)
    expect(hmLevel(1)).toBe(1)
    expect(hmLevel(2)).toBe(2)
    expect(hmLevel(3)).toBe(2)
    expect(hmLevel(4)).toBe(3)
    expect(hmLevel(6)).toBe(3)
    expect(hmLevel(7)).toBe(4)
  })
})

describe('buildMonthCells', () => {
  it('固定 42 格，首格为月初所在周的周日，跨月标记正确', () => {
    // 2026-08-01 是周六 → 所在周周日为 2026-07-26
    const cells = buildMonthCells(2026, 7)
    expect(cells).toHaveLength(42)
    expect(cells[0].iso).toBe('2026-07-26')
    expect(cells[0].otherMonth).toBe(true)
    const aug1 = cells.find((c) => c.iso === '2026-08-01')!
    expect(aug1.day).toBe(1)
    expect(aug1.otherMonth).toBe(false)
    expect(cells[41].otherMonth).toBe(true) // 42 格末尾必为下月
    // 本月 31 天 + 前 6 天（7/26-31）+ 后 5 天（9/1-5）= 42
    expect(cells.filter((c) => !c.otherMonth)).toHaveLength(31)
    expect(cells[41].iso).toBe('2026-09-05')
  })

  it('月初恰为周日时首格即 1 号', () => {
    // 2026-11-01 是周日
    const cells = buildMonthCells(2026, 10)
    expect(cells[0].iso).toBe('2026-11-01')
    expect(cells[0].otherMonth).toBe(false)
  })
})

describe('heatmapRange', () => {
  it('365 天回溯并对齐到周日', () => {
    const today = new Date(2026, 7, 16) // 周日
    const r = heatmapRange(today)
    expect(r.start.getDay()).toBe(0)
    expect(r.totalWeeks).toBeGreaterThanOrEqual(52)
    expect(r.totalWeeks).toBeLessThanOrEqual(53)
  })
})
