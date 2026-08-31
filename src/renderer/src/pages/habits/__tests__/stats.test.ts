import { describe, expect, it } from 'vitest'

import {
  completionRate,
  currentStreak,
  longestStreak,
  overallWindowCompletionRate,
  strengthIndex,
  weekdayDistribution,
  yearlyCheckinStats,
  yearlyHeatCells,
  yearWindow
} from '../services/stats'

// 手算基准区间：created='2026-08-01'，today='2026-08-10'（10 个自然日）
const D1_9 = new Set([
  '2026-08-01',
  '2026-08-02',
  '2026-08-03',
  '2026-08-04',
  '2026-08-05',
  '2026-08-06',
  '2026-08-07',
  '2026-08-08',
  '2026-08-09'
])
const D1_10 = new Set([...D1_9, '2026-08-10'])
const D1_8 = new Set([
  '2026-08-01',
  '2026-08-02',
  '2026-08-03',
  '2026-08-04',
  '2026-08-05',
  '2026-08-06',
  '2026-08-07',
  '2026-08-08'
])

describe('currentStreak', () => {
  it('今天没打不算断：1~9 号 done，10 号空 → 连续 9', () => {
    expect(currentStreak(D1_9, new Set(), '2026-08-01', '2026-08-10')).toBe(9)
  })
  it('今天打了连续 10', () => {
    expect(currentStreak(D1_10, new Set(), '2026-08-01', '2026-08-10')).toBe(10)
  })
  it('昨天空：今天打了=1，今天没打=0', () => {
    expect(currentStreak(new Set([...D1_8, '2026-08-10']), new Set(), '2026-08-01', '2026-08-10')).toBe(1)
    expect(currentStreak(D1_8, new Set(), '2026-08-01', '2026-08-10')).toBe(0)
  })
  it('skip 不断卡：1~5 done，6 skip，7~9 done，10 空 → 连续 9', () => {
    const done = new Set([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09'
    ])
    const skip = new Set(['2026-08-06'])
    expect(currentStreak(done, skip, '2026-08-01', '2026-08-10')).toBe(9)
  })
  it('不越过创建日：created 之后才有记录', () => {
    expect(currentStreak(D1_10, new Set(), '2026-08-05', '2026-08-10')).toBe(6)
  })
  it('今天被跳过同样计 1 天：昨天 done + 今天 skip → 连续 10', () => {
    expect(currentStreak(D1_9, new Set(['2026-08-10']), '2026-08-01', '2026-08-10')).toBe(10)
  })
  it('今天 skip 且昨天空：仅今天计 1（skip 未中断）', () => {
    expect(currentStreak(new Set(), new Set(['2026-08-10']), '2026-08-01', '2026-08-10')).toBe(1)
  })
})

describe('longestStreak', () => {
  it('两段 3 天和 5 天 → 5', () => {
    const done = new Set([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
      '2026-08-10'
    ])
    expect(longestStreak(done, new Set(), '2026-08-01', '2026-08-10')).toBe(5)
  })
  it('skip 维持段长：1~3 done，4 skip，5~7 done → 最长 7', () => {
    const done = new Set(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-05', '2026-08-06', '2026-08-07'])
    const skip = new Set(['2026-08-04'])
    expect(longestStreak(done, skip, '2026-08-01', '2026-08-07')).toBe(7)
  })
})

describe('completionRate', () => {
  it('done 5 / (10 天 - skip 1) = 55.56', () => {
    expect(completionRate(5, 1, '2026-08-01', '2026-08-10')).toBeCloseTo(55.56, 1)
  })
  it('全勤 = 100；除零（区间全 skip）= 100 不崩', () => {
    expect(completionRate(10, 0, '2026-08-01', '2026-08-10')).toBe(100)
    expect(completionRate(0, 10, '2026-08-01', '2026-08-10')).toBe(100)
  })
})

describe('strengthIndex（EMA，m=0.5^(1/13)）', () => {
  const m = 0.5 ** (1 / 13)
  it('完美打卡 1 天 ≈ (1-m)*100', () => {
    expect(strengthIndex(new Set(['2026-08-01']), new Set(), '2026-08-01', '2026-08-01')).toBeCloseTo((1 - m) * 100, 1)
  })
  it('完美打卡 10 天 ≈ (1-m^10)*100 且单调逼近 100', () => {
    const got = strengthIndex(D1_10, new Set(), '2026-08-01', '2026-08-10')
    expect(got).toBeCloseTo((1 - m ** 10) * 100, 1)
    expect(got).toBeLessThan(100)
  })
  it('skip 日不衰减：done 1 号 + skip 2~9 号，分数保持 done 当日值', () => {
    const doneOne = strengthIndex(new Set(['2026-08-01']), new Set(), '2026-08-01', '2026-08-01')
    const skips = new Set([
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09'
    ])
    expect(strengthIndex(new Set(['2026-08-01']), skips, '2026-08-01', '2026-08-09')).toBeCloseTo(doneOne, 6)
  })
  it('断卡不清零：先完美 9 天再断 1 天，仍保留 30 分以上', () => {
    // 手算：S9 = 1 - m^9 ≈ 38.1，断 1 天 S10 = S9*m ≈ 36.1
    expect(strengthIndex(D1_9, new Set(), '2026-08-01', '2026-08-10')).toBeGreaterThan(30)
  })
})

describe('overallWindowCompletionRate（多习惯总量比）', () => {
  it('两个习惯总量比：done 总 6 / 应打总 19 = 31.6（A: 5/10，B: 1/9 skip 1）', () => {
    const a = {
      done: new Set(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05']),
      skip: new Set<string>()
    }
    const b = { done: new Set(['2026-08-02']), skip: new Set(['2026-08-07']) }
    expect(overallWindowCompletionRate([a, b], ['2026-08-01', '2026-08-01'], '2026-08-10', 30)).toBeCloseTo(31.6, 1)
  })
  it('无活跃习惯 → 100 不崩', () => {
    expect(overallWindowCompletionRate([], [], '2026-08-10', 30)).toBe(100)
  })
})

describe('weekdayDistribution', () => {
  // 2026-08-01 是周六。区间 08-01(六)~08-09(日)：
  // 周六×2（01 done、08 未 done）→ 50；周日×2（02 done、09 skip 分母排除）→ 100；周一 done 1/1 → 100；周二~五 → 0
  it('分母排除 skip；按周几统计 done 率', () => {
    const doneDates = ['2026-08-01', '2026-08-02', '2026-08-03']
    const skipSet = new Set(['2026-08-09'])
    const dist = weekdayDistribution(doneDates, skipSet, '2026-08-01', '2026-08-09')
    expect(dist[0]).toBe(100) // 周日
    expect(dist[1]).toBe(100) // 周一
    expect(dist[2]).toBe(0)
    expect(dist[5]).toBe(0)
    expect(dist[6]).toBe(50) // 周六
  })
})

describe('yearWindow（自然年区间，起点不早于创建日，终点不晚于今天）', () => {
  // 习惯创建于 2025-06-01，今天 2026-08-29
  const created = '2025-06-01'
  const today = '2026-08-29'
  it('未满的当前年按今天截断：2026 → 01-01 ~ 08-29', () => {
    expect(yearWindow(2026, created, today)).toEqual({ start: '2026-01-01', end: '2026-08-29' })
  })
  it('已过去的年取全年，起点不早于创建日：2025 → 06-01 ~ 12-31', () => {
    expect(yearWindow(2025, created, today)).toEqual({ start: '2025-06-01', end: '2025-12-31' })
  })
  it('创建年之前的年份 → 空窗口（start > end），stats 全 0 不崩', () => {
    const w = yearWindow(2024, created, today)
    expect(w.start > w.end).toBe(true)
    const s = yearlyCheckinStats(new Set(), new Set(), created, 2024, today)
    expect(s.done).toBe(0)
    expect(s.elapsedDays).toBe(0)
    expect(s.rate).toBe(100)
  })
  it('闰年 12-31 不越界：2024 全年 → 01-01 ~ 12-31', () => {
    expect(yearWindow(2024, '2024-01-01', '2024-12-31')).toEqual({ start: '2024-01-01', end: '2024-12-31' })
  })
})

describe('yearlyCheckinStats（单习惯自然年打卡统计）', () => {
  // 习惯创建于 2025-06-01；2026 年前 8 个月打卡（今天 2026-08-29）
  const created = '2025-06-01'
  const today = '2026-08-29'
  const done = new Set([
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
    '2026-02-01',
    '2026-02-02',
    '2026-03-01',
    '2025-12-31' // 上年记录，不应计入 2026
  ])
  const skip = new Set(['2026-01-05', '2026-01-06'])
  it('只统计当年窗口内 done：6 天（2025-12-31 不计入）', () => {
    const s = yearlyCheckinStats(done, skip, created, 2026, today)
    expect(s.done).toBe(6)
  })
  it('elapsedDays = 01-01~08-29 = 241 天；skipCount = 2；rate = 6/(241-2)', () => {
    const s = yearlyCheckinStats(done, skip, created, 2026, today)
    expect(s.elapsedDays).toBe(241)
    expect(s.skipCount).toBe(2)
    expect(s.rate).toBeCloseTo((6 / 239) * 100, 1)
  })
  it('2025 年窗口从创建日起：06-01~12-31 = 214 天，done=1（2025-12-31）', () => {
    const s = yearlyCheckinStats(done, skip, created, 2025, today)
    expect(s.elapsedDays).toBe(214)
    expect(s.done).toBe(1)
  })
  it('窗口内全 skip → rate 100 不崩', () => {
    const s = yearlyCheckinStats(new Set(), new Set(['2026-01-01']), created, 2026, '2026-01-01')
    expect(s.rate).toBe(100)
  })
})

describe('yearlyHeatCells（自然年热力图格子，周列对齐）', () => {
  it('2024 闰年全勤：366 格；2024-01-01 是周一 → 起始 week=0/dow=1；52 周+1 → cols=53', () => {
    const done = new Set(['2024-02-29', '2024-12-31'])
    const cells = yearlyHeatCells(done, new Set(), 2024, '2024-12-31')
    expect(cells.cells).toHaveLength(366)
    expect(cells.cells[0]).toEqual({ date: '2024-01-01', state: 'none', week: 0, dow: 1 })
    const feb29 = cells.cells.find((c) => c.date === '2024-02-29')
    expect(feb29?.state).toBe('done')
    const dec31 = cells.cells.find((c) => c.date === '2024-12-31')
    expect(dec31?.state).toBe('done')
    expect(cells.cols).toBe(53)
  })
  it('skip 标 state=skip；未来日期标 future；今天之前未打卡标 none', () => {
    const done = new Set(['2026-01-01'])
    const skip = new Set(['2026-01-02'])
    const cells = yearlyHeatCells(done, skip, 2026, '2026-01-05')
    expect(cells.cells.find((c) => c.date === '2026-01-01')?.state).toBe('done')
    expect(cells.cells.find((c) => c.date === '2026-01-02')?.state).toBe('skip')
    expect(cells.cells.find((c) => c.date === '2026-01-03')?.state).toBe('none')
    expect(cells.cells.find((c) => c.date === '2026-01-06')?.state).toBe('future')
    expect(cells.cells).toHaveLength(365)
  })
  it('月份标签：年份首个格子所在周不重复打标（2026-01 只在首周出现一次）', () => {
    const cells = yearlyHeatCells(new Set(), new Set(), 2026, '2026-12-31')
    expect(cells.labels.length).toBeGreaterThanOrEqual(1)
    expect(cells.labels[0].label).toBe('1月')
    expect(cells.labels.filter((l) => l.label === '1月')).toHaveLength(1)
  })
})
