/**
 * 打卡数据访问服务（写操作入口）
 * 约定：所有写操作完成后无需手动刷新——UI 通过 useLiveQuery 自动感知变化
 */
import { db } from '@renderer/databases'

import type { Habit, HabitRecord } from '../types'

/** 点格子：无记录→打 done；done→取消（删行）；skip→改为 done。返回新状态（撤销 toast 判断用） */
export async function toggleRecord(habitId: string, date: string): Promise<'added' | 'removed'> {
  const existing = await db.habit_records.get([habitId, date])
  if (!existing) {
    await db.habit_records.put({ habitId, date, status: 'done', createdAt: Date.now() })
    return 'added'
  }
  if (existing.status === 'done') {
    await db.habit_records.delete([habitId, date])
    return 'removed'
  }
  await db.habit_records.put({ ...existing, status: 'done', createdAt: Date.now() })
  return 'added'
}

/** 恢复某格到指定原状态（撤销操作）：prev 为 null 表示撤销到"无记录" */
export async function restoreRecord(habitId: string, date: string, prev: HabitRecord | null): Promise<void> {
  if (!prev) {
    await db.habit_records.delete([habitId, date])
    return
  }
  await db.habit_records.put(prev)
}

/** 跳过标记：skip=true 时 done 改 skip / 无记录建 skip；skip=false 时仅删 skip（不动 done） */
export async function setSkip(habitId: string, date: string, skip: boolean): Promise<void> {
  const existing = await db.habit_records.get([habitId, date])
  if (skip) {
    if (existing?.status === 'skip') return
    await db.habit_records.put({ habitId, date, status: 'skip', createdAt: Date.now() })
    return
  }
  if (existing?.status === 'skip') {
    await db.habit_records.delete([habitId, date])
  }
}

/** 新建习惯，返回新 id（order 排到末尾） */
export async function addHabit(input: { name: string; icon: string; color: string }): Promise<string> {
  const all = await db.habits.toArray()
  const maxOrder = all.reduce((max, h) => Math.max(max, h.order), 0)
  const id = crypto.randomUUID()
  const habit: Habit = {
    id,
    name: input.name,
    icon: input.icon,
    color: input.color,
    order: maxOrder + 1,
    archived: false,
    createdAt: Date.now(),
    frequencyType: 'daily'
  }
  await db.habits.put(habit)
  return id
}

export async function updateHabit(id: string, patch: Partial<Omit<Habit, 'id'>>): Promise<void> {
  await db.habits.update(id, patch)
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  await db.habits.update(id, { archived })
}

/** 彻底删除：习惯定义连带全部打卡记录，事务保证一致性（UI 侧必须二次确认） */
export async function deleteHabitForever(id: string): Promise<void> {
  await db.transaction('rw', db.habits, db.habit_records, async () => {
    await db.habits.delete(id)
    // ponytail: habitId 非独立索引（schema 只有复合主键和 date），where() 会抛 SchemaError；
    // filter 全表扫描在万级数据量下毫秒级，彻底删除又是低频操作——加索引/升 v14 不值
    await db.habit_records.filter((r) => r.habitId === id).delete()
  })
}

export interface HabitsBackup {
  version: 1
  exportedAt: number
  habits: Habit[]
  records: HabitRecord[]
}

/** JSON 导出（轻量迁移通道，不依赖整库备份） */
export async function exportHabitsJson(): Promise<string> {
  const backup: HabitsBackup = {
    version: 1,
    exportedAt: Date.now(),
    habits: await db.habits.toArray(),
    records: await db.habit_records.toArray()
  }
  return JSON.stringify(backup, null, 2)
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 系统边界校验：导入是替换式写库（不可逆），行数据损坏会整库污染日历/统计，必须在写入前拦下 */
function isValidHabitRow(h: unknown): h is Habit {
  if (typeof h !== 'object' || h === null) return false
  const o = h as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.icon === 'string' &&
    typeof o.color === 'string' &&
    typeof o.order === 'number' &&
    typeof o.archived === 'boolean' &&
    typeof o.createdAt === 'number'
  )
}

function isValidRecordRow(r: unknown): r is HabitRecord {
  if (typeof r !== 'object' || r === null) return false
  const o = r as Record<string, unknown>
  return (
    typeof o.habitId === 'string' &&
    typeof o.date === 'string' &&
    ISO_DATE_RE.test(o.date) &&
    (o.status === 'done' || o.status === 'skip') &&
    typeof o.createdAt === 'number'
  )
}

/** 解析并校验备份 JSON：结构或任一行不合法即抛错（调用方负责提示） */
export function parseHabitsBackup(json: string): HabitsBackup {
  const parsed = JSON.parse(json) as Partial<HabitsBackup>
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.habits) || !Array.isArray(parsed.records)) {
    throw new Error('invalid habits backup file')
  }
  if (!parsed.habits.every(isValidHabitRow) || !parsed.records.every(isValidRecordRow)) {
    throw new Error('invalid habits backup file')
  }
  // 引用完整性：记录必须挂在已知的习惯上（孤儿记录会静默入库且永不显示）
  const habitIds = new Set(parsed.habits.map((h) => h.id))
  if (!parsed.records.every((r) => habitIds.has(r.habitId))) {
    throw new Error('invalid habits backup file')
  }
  return { version: 1, exportedAt: parsed.exportedAt ?? Date.now(), habits: parsed.habits, records: parsed.records }
}

/** JSON 导入（整体替换式：清空现有打卡数据后写入，幂等；UI 侧必须确认） */
export async function importHabitsJson(json: string): Promise<{ habits: number; records: number }> {
  const backup = parseHabitsBackup(json)
  const habits = backup.habits
  const records = backup.records
  await db.transaction('rw', db.habits, db.habit_records, async () => {
    await db.habits.clear()
    await db.habit_records.clear()
    await db.habits.bulkPut(habits)
    await db.habit_records.bulkPut(records)
  })
  return { habits: habits.length, records: records.length }
}
