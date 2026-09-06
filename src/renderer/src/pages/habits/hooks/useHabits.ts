/**
 * 打卡数据 hooks：useLiveQuery 直连 Dexie（对齐 notes 页面模式），数据变化自动重渲染
 */
import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'

import { monthRange } from '../services/calendar'
import type { HabitDateSets } from '../services/stats'
import type { Habit, HabitRecord } from '../types'

function byOrder(a: Habit, b: Habit): number {
  return a.order - b.order
}

export function useActiveHabits(): Habit[] {
  return useLiveQuery(async () => (await db.habits.toArray()).filter((h) => !h.archived).sort(byOrder), [], [])
}

export function useArchivedHabits(): Habit[] {
  return useLiveQuery(async () => (await db.habits.toArray()).filter((h) => h.archived).sort(byOrder), [], [])
}

interface MonthRecords {
  byHabit: Map<string, HabitRecord[]>
}

/** 某月全部打卡记录，按 habitId 分组（月历格子渲染用） */
export function useMonthRecords(year: number, month: number): MonthRecords {
  return useLiveQuery<MonthRecords, MonthRecords>(
    async () => {
      const { start, end } = monthRange(year, month)
      const rows = await db.habit_records.where('date').between(start, end, true, true).toArray()
      const byHabit = new Map<string, HabitRecord[]>()
      for (const row of rows) {
        const list = byHabit.get(row.habitId)
        if (list) list.push(row)
        else byHabit.set(row.habitId, [row])
      }
      return { byHabit }
    },
    [year, month],
    { byHabit: new Map() }
  )
}

/** 全量记录按习惯聚合成 done/skip 日期集合（streak/强度/完成率统计用；数据量万级无压力） */
export function useAllRecords(): Map<string, HabitDateSets> {
  return useLiveQuery<Map<string, HabitDateSets>, Map<string, HabitDateSets>>(
    async () => {
      const rows = await db.habit_records.toArray()
      const map = new Map<string, HabitDateSets>()
      for (const row of rows) {
        let sets = map.get(row.habitId)
        if (!sets) {
          sets = { done: new Set(), skip: new Set() }
          map.set(row.habitId, sets)
        }
        if (row.status === 'done') sets.done.add(row.date)
        else if (row.status === 'skip') sets.skip.add(row.date)
      }
      return map
    },
    [],
    new Map()
  )
}
