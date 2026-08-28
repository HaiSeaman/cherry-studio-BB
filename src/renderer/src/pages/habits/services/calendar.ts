/**
 * 打卡 TAB 月历日期工具（纯函数，本地时区口径 'YYYY-MM-DD'，与 hub_day_notes 一致）
 */

export interface MonthDay {
  date: string // 'YYYY-MM-DD'
  day: number // 1..31
  isToday: boolean
  isFuture: boolean
}

/** 本地时区 ISO 日期（补零），不走 toISOString（那是 UTC，跨时区会偏一天） */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  // month: 1~12
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return table[month - 1]
}

/** 整月日期序列（1 号到月末），today 用于标记 isToday/isFuture */
export function monthDays(year: number, month: number, today: string): MonthDay[] {
  const total = daysInMonth(year, month)
  const days: MonthDay[] = []
  for (let day = 1; day <= total; day++) {
    const mm = String(month).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    const date = `${year}-${mm}-${dd}`
    days.push({ date, day, isToday: date === today, isFuture: date > today })
  }
  return days
}

/** Dexie between 用：整月首尾 ISO 日期（含首尾） */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, '0')
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(daysInMonth(year, month)).padStart(2, '0')}`
  }
}

/** 月份平移（month: 1~12，跨年回绕正确） */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 }
}

/** ISO 日期是周几（0=周日…6=周六），月历表头周末标记用 */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/** ISO 日期加减天（本地时区安全：经 Date 中转，避免 UTC 偏移） */
export function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  return toISODate(date)
}
