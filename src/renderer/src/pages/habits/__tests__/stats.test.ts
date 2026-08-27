import { describe, expect, it } from 'vitest'

import { completionRate, currentStreak, longestStreak, overallWindowCompletionRate, strengthIndex, weekdayDistribution } from '../services/stats'

// 手算基准区间：created='2026-08-01'，today='2026-08-10'（10 个自然日）
const D1_9 = new Set(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'])
const D1_10 = new Set([...D1_9, '2026-08-10'])
const D1_8 = new Set(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'])

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
    const done = new Set(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-07', '2026-08-08', '2026-08-09'])
    const skip = new Set(['2026-08-06'])
    expect(currentStreak(done, skip, '2026-08-01', '2026-08-10')).toBe(9)
  })
  it('不越过创建日：created 之后才有记录', () => {
    expect(currentStreak(D1_10, new Set(), '2026-08-05', '2026-08-10')).toBe(6)
  })
})

describe('longestStreak', () => {
  it('两段 3 天和 5 天 → 5', () => {
    const done = new Set(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10'])
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
    const skips = new Set(['2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'])
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
