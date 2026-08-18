import { dateKeyOf as toISODate } from './schedule'
export { toISODate }

/** 热力图 5 档：0→0，1→1，≤3→2，≤6→3，>6→4 */
export function hmLevel(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score <= 0) return 0
  if (score === 1) return 1
  if (score <= 3) return 2
  if (score <= 6) return 3
  return 4
}

export type MonthCell = { iso: string; day: number; otherMonth: boolean }

/** 月历 42 格（6 行 × 7 列）：首格 = 月初所在周的周日，前后月 otherMonth 标记 */
export function buildMonthCells(viewYear: number, viewMonth: number): MonthCell[] {
  const first = new Date(viewYear, viewMonth, 1)
  const start = new Date(viewYear, viewMonth, 1 - first.getDay())
  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({
      iso: toISODate(d),
      day: d.getDate(),
      otherMonth: d.getMonth() !== viewMonth
    })
  }
  return cells
}

/** 热力图范围：最近 365 天，起始日回溯对齐到周日 */
export function heatmapRange(today: Date): { start: Date; totalWeeks: number } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = new Date(t)
  start.setDate(start.getDate() - 365 + 1)
  start.setDate(start.getDate() - start.getDay())
  const totalDays = Math.round((t.getTime() - start.getTime()) / 86400000) + 1
  return { start, totalWeeks: Math.ceil(totalDays / 7) }
}
