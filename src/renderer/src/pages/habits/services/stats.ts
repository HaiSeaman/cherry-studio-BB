/**
 * 打卡统计引擎（纯函数，口径唯一出口）
 * 口径（spec 4.4）：跳过(skip)日不算应打卡日、不断卡；今天未打卡不判死；强度指数为 EMA（半衰期 13 天）
 * 组件禁止自行实现口径，一律引用本模块
 */
import { addDaysISO } from './calendar'

/** ISO 日期加减天：统一从 calendar.ts 引入（见 calendar.addDaysISO） */

/** 从 from 到 to 逐日迭代（含首尾）；from > to 时不执行 */
function eachDate(from: string, to: string, fn: (iso: string) => void): void {
  let d = from
  while (d <= to) {
    fn(d)
    d = addDaysISO(d, 1)
  }
}

/** 当前连续（未中断天数）：从今天往前数；今天没打不判死（从昨天数）；done/skip 都计 1 天；空格停；不越过创建日 */
export function currentStreak(doneSet: Set<string>, skipSet: Set<string>, createdISO: string, today: string): number {
  let count = 0
  let d = doneSet.has(today) ? today : addDaysISO(today, -1)
  while (d >= createdISO) {
    if (doneSet.has(d) || skipSet.has(d)) {
      count++
    } else {
      break
    }
    d = addDaysISO(d, -1)
  }
  return count
}

/** 历史最长连续（未中断天数）：done 累加、skip 同样累加（未中断）、空格归零 */
export function longestStreak(doneSet: Set<string>, skipSet: Set<string>, createdISO: string, today: string): number {
  let best = 0
  let cur = 0
  eachDate(createdISO, today, (d) => {
    if (doneSet.has(d) || skipSet.has(d)) {
      cur++
      if (cur > best) best = cur
    } else {
      cur = 0
    }
  })
  return best
}

/** 完成率 = done / (区间天数 - skip 天数) × 100，保留两位；分母为 0 视为 100 */
export function completionRate(doneCount: number, skipCount: number, createdISO: string, today: string): number {
  let total = 0
  eachDate(createdISO, today, () => total++)
  const denom = total - skipCount
  if (denom <= 0) return 100
  return Number(((doneCount / denom) * 100).toFixed(2))
}

export interface HabitDateSets {
  done: Set<string>
  skip: Set<string>
}

/** 多习惯近 N 天完成率（总量比：Σdone / Σ应打，权重随天数）；无习惯 → 100 */
export function overallWindowCompletionRate(
  setsList: HabitDateSets[],
  createdISOs: string[],
  today: string,
  windowDays: number
): number {
  let total = 0
  let done = 0
  setsList.forEach((sets, i) => {
    let start = addDaysISO(today, -(windowDays - 1))
    const createdISO = createdISOs[i]
    if (start < createdISO) start = createdISO
    eachDate(start, today, (d) => {
      if (sets.skip.has(d)) return
      total++
      if (sets.done.has(d)) done++
    })
  })
  if (total === 0) return 100
  return Number(((done / total) * 100).toFixed(1))
}

/** EMA 半衰期 13 天（spec 4.4）；skip 日分数保持；返回 0~100。
 *  签名收 done/skip 两个集合（而非记录数组），从接口上杜绝调用方漏传 skip */
export function strengthIndex(doneSet: Set<string>, skipSet: Set<string>, createdISO: string, today: string): number {
  const m = 0.5 ** (1 / 13)
  let s = 0
  eachDate(createdISO, today, (d) => {
    if (skipSet.has(d)) return
    const x = doneSet.has(d) ? 1 : 0
    s = s * m + x * (1 - m)
  })
  return Number((s * 100).toFixed(2))
}

/** 星期分布：按周几统计 done 率（分母排除 skip），索引 0=周日…6=周六，单位 % */
export function weekdayDistribution(
  doneDates: string[],
  skipSet: Set<string>,
  createdISO: string,
  today: string
): number[] {
  const doneSet = new Set(doneDates)
  const denom = new Array(7).fill(0)
  const num = new Array(7).fill(0)
  eachDate(createdISO, today, (d) => {
    const w = (() => {
      const [y, m, day] = d.split('-').map(Number)
      return new Date(y, m - 1, day).getDay()
    })()
    if (skipSet.has(d)) return
    denom[w]++
    if (doneSet.has(d)) num[w]++
  })
  return denom.map((n, i) => (n === 0 ? 0 : Number(((num[i] / n) * 100).toFixed(1))))
}
