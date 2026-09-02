import Dexie, { type Table } from 'dexie'
import { db } from '../databases'
import type { Habit, HabitRecord } from '../pages/habits/types'
import type { HubAlarm, HubDayNote, HubNote, HubTodo } from '../pages/notes/types'

/**
 * 跨设备同步适配器（电脑端）
 * 红线遵守：不改 BackupManager.ts、不改 databases/index.ts（主库冻结）：
 * - 同步 UUID/时间戳映射存放在独立旁路库 RKSyncStore（新库）
 * - 主库表只读/写记录，schema 不动
 * JSON 规格与手机端（RikkaHub fork SyncEngine）完全一致。
 */

// ---------- 旁路同步库 ----------
export const syncDb = new Dexie('RKSyncStore')
syncDb.version(1).stores({
  mappings: '++id, table, syncUuid',
  states: '&key'
})

export type SyncMapping = { id?: number; table: string; syncUuid: string; localId: string | number; updatedAt: number }
type SyncState = { key: string; value: string }

// ---------- 文件柜 ----------
export const SYNC_DIR = 'cherry-rk-sync'
export const SYNC_FILES = {
  notes: `${SYNC_DIR}/notes.json`,
  todos: `${SYNC_DIR}/todos.json`,
  dayNotes: `${SYNC_DIR}/day_notes.json`,
  habits: `${SYNC_DIR}/habits.json`,
  habitRecords: `${SYNC_DIR}/habit_records.json`,
  alarms: `${SYNC_DIR}/alarms.json`
} as const

// ---------- DTO（与手机端 schema 对齐） ----------
export type SyncNoteDto = { syncId: string; content: string; status: string; createdAt: number; updatedAt: number; deleted: boolean }
export type SyncTodoDto = { syncId: string; text: string; done: boolean; completedAt?: number | null; status: string; createdAt: number; updatedAt: number; deleted: boolean }
export type SyncDayNoteDto = { syncId: string; date: string; content: string; createdAt: number; updatedAt: number; deleted: boolean }
export type SyncHabitDto = { syncId: string; name: string; icon: string; color: string; order: number; frequencyType: string; timesPerWeek?: number | null; daysOfWeek?: number[] | null; archived: boolean; createdAt: number; updatedAt: number; deleted: boolean }
export type SyncHabitRecordDto = { syncId: string; habitSyncId: string; date: string; status: string; count?: number | null; createdAt: number; updatedAt: number; deleted: boolean }
export type SyncAlarmDto = { syncId: string; h: number; m: number; s: number; enabled: boolean; label: string; sound?: string | null; date?: string | null; lastTriggerKey?: string | null; createdAt: number; updatedAt: number; deleted: boolean }

export type SyncBundle = { notes: SyncNoteDto[]; todos: SyncTodoDto[]; dayNotes: SyncDayNoteDto[]; habits: SyncHabitDto[]; habitRecords: SyncHabitRecordDto[]; alarms: SyncAlarmDto[] }
export type SyncConfigDto = { channel: 'none' | 's3' | 'webdav'; s3?: Record<string, unknown>; webdav?: Record<string, unknown> }
export type SyncResult = { ok: boolean; message: string }

const mappings = syncDb.table<SyncMapping>('mappings')
const states = syncDb.table<SyncState>('states')

// ---------- 通用合并（LWW，与手机端 SyncMerge 语义一致） ----------
function lastWriteWins<T>(local: T[], remote: T[], id: (t: T) => string, updatedAt: (t: T) => number): T[] {
  const map = new Map<string, T>()
  local.forEach((t) => map.set(id(t), t))
  remote.forEach((t) => {
    const key = id(t)
    const cur = map.get(key)
    if (!cur || updatedAt(t) >= updatedAt(cur)) map.set(key, t)
  })
  return [...map.values()]
}

function dedupeByKey<T>(list: T[], key: (t: T) => string, updatedAt: (t: T) => number): T[] {
  const map = new Map<string, T>()
  list.forEach((t) => {
    const k = key(t)
    const cur = map.get(k)
    if (!cur || updatedAt(t) >= updatedAt(cur)) map.set(k, t)
  })
  return [...map.values()]
}

// ---------- 映射工具 ----------
async function mappingFor(table: string, syncUuid: string): Promise<SyncMapping | undefined> {
  return mappings.where('syncUuid').equals(syncUuid).and((m) => m.table === table).first()
}

async function lazyUuid(table: string, localId: string | number, fallbackUpdatedAt: number): Promise<{ syncUuid: string; updatedAt: number }> {
  const existing = await mappings.where('table').equals(table).and((m) => String(m.localId) === String(localId)).first()
  if (existing) return { syncUuid: existing.syncUuid, updatedAt: existing.updatedAt }
  const syncUuid = crypto.randomUUID()
  await mappings.add({ table, syncUuid, localId, updatedAt: fallbackUpdatedAt })
  return { syncUuid, updatedAt: fallbackUpdatedAt }
}

/**
 * 新增/更新行的映射。用于记录 id 变化或新插入行。
 * 按 syncUuid 定位既有映射更新 localId；没有则按 (table, localId) 找旧映射复用。
 */
async function bindUuid(table: string, syncUuid: string, localId: string | number, updatedAt: number): Promise<void> {
  const byUuid = await mappingFor(table, syncUuid)
  if (byUuid) {
    if (String(byUuid.localId) !== String(localId)) {
      byUuid.localId = localId
      byUuid.updatedAt = updatedAt
      await mappings.put(byUuid)
    }
    return
  }
  const byLocal = await mappings.where('table').equals(table).and((m) => String(m.localId) === String(localId)).first()
  if (byLocal && byLocal.syncUuid !== syncUuid) {
    // 该本地行已绑定其它 syncUuid（syncId 罕见更替）：以新 uuid 为准
    byLocal.syncUuid = syncUuid
    byLocal.updatedAt = updatedAt
    await mappings.put(byLocal)
    return
  }
  await mappings.add({ table, syncUuid, localId, updatedAt })
}

// ---------- 导出（BB → JSON） ----------
export async function exportAll(): Promise<SyncBundle> {
  const now = Date.now()

  const notes: SyncNoteDto[] = []
  for (const r of (await db.hub_notes.toArray()) as HubNote[]) {
    const { syncUuid, updatedAt } = await lazyUuid('hub_notes', r.id!, r.updatedAt ?? now)
    notes.push({ syncId: syncUuid, content: r.content, status: r.status, createdAt: r.createdAt ?? now, updatedAt, deleted: r.status === 'trashed' })
  }

  const todos: SyncTodoDto[] = []
  for (const r of (await db.hub_todos.toArray()) as HubTodo[]) {
    const { syncUuid, updatedAt } = await lazyUuid('hub_todos', r.id!, r.updatedAt ?? now)
    todos.push({ syncId: syncUuid, text: r.text, done: r.done, completedAt: r.completedAt ?? null, status: r.status, createdAt: r.createdAt ?? now, updatedAt, deleted: r.status === 'trashed' })
  }

  const dayNotes: SyncDayNoteDto[] = []
  for (const r of (await db.hub_day_notes.toArray()) as HubDayNote[]) {
    const { syncUuid } = await lazyUuid('hub_day_notes', r.id!, r.createdAt ?? now) // 表无 updatedAt，以 createdAt 稳定
    dayNotes.push({ syncId: syncUuid, date: r.date, content: r.content, createdAt: r.createdAt ?? now, updatedAt: r.createdAt ?? now, deleted: false })
  }

  const habits: SyncHabitDto[] = []
  for (const r of (await db.habits.toArray()) as Habit[]) {
    const syncId = r.id // habits.id 本身是 UUID，直接复用
    habits.push({ syncId, name: r.name, icon: r.icon, color: r.color, order: r.order ?? 0, frequencyType: r.frequencyType ?? 'daily', timesPerWeek: r.timesPerWeek ?? null, daysOfWeek: r.daysOfWeek ?? null, archived: r.archived ?? false, createdAt: r.createdAt ?? now, updatedAt: r.createdAt ?? now, deleted: r.archived ?? false })
  }

  const habitRecords: SyncHabitRecordDto[] = []
  for (const r of (await db.habit_records.toArray()) as HabitRecord[]) {
    const syncId = `${r.habitId}:${r.date}` // 复合主键派生稳定 syncId
    habitRecords.push({ syncId, habitSyncId: r.habitId, date: r.date, status: r.status, count: r.count ?? null, createdAt: r.createdAt ?? now, updatedAt: r.createdAt ?? now, deleted: false })
  }

  const alarms: SyncAlarmDto[] = []
  for (const r of (await db.hub_alarms.toArray()) as HubAlarm[]) {
    const { syncUuid, updatedAt } = await lazyUuid('hub_alarms', r.id!, now) // 表无 createdAt/updatedAt，由映射固化
    alarms.push({ syncId: syncUuid, h: r.h, m: r.m, s: r.s, enabled: r.enabled, label: r.label, sound: r.sound ?? null, date: r.date ?? null, lastTriggerKey: r.lastTriggerKey ?? null, createdAt: updatedAt, updatedAt, deleted: false })
  }

  return { notes, todos, dayNotes, habits, habitRecords, alarms }
}

// ---------- 导入（JSON → BB，LWW 合并） ----------
export async function importAll(remote: SyncBundle): Promise<void> {
  const now = Date.now()

  // 便签
  const localNotes = (await db.hub_notes.toArray()) as HubNote[]
  const localNoteDtos: SyncNoteDto[] = []
  for (const r of localNotes) {
    const uuid = await lazyUuid('hub_notes', r.id!, r.updatedAt ?? now)
    localNoteDtos.push({ syncId: uuid.syncUuid, content: r.content, status: r.status, createdAt: r.createdAt ?? now, updatedAt: r.updatedAt ?? now, deleted: r.status === 'trashed' })
  }
  const mergedNotes = lastWriteWins(localNoteDtos, remote.notes, (t) => t.syncId, (t) => t.updatedAt)
  for (const dto of mergedNotes) {
    const existing = await mappingFor('hub_notes', dto.syncId)
    if (dto.deleted) {
      if (existing) {
        const row = await db.hub_notes.get(existing.localId as number)
        if (row) await db.hub_notes.update(row.id!, { status: 'trashed', updatedAt: dto.updatedAt })
      }
      continue
    }
    const row: HubNote = {
      content: dto.content,
      status: (['active', 'archived', 'trashed'] as const).includes(dto.status as never) ? (dto.status as HubNote['status']) : 'active',
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt
    }
    if (existing) {
      row.id = existing.localId as number
      await db.hub_notes.put(row)
    } else {
      const newId = await db.hub_notes.add(row)
      await bindUuid('hub_notes', dto.syncId, newId as number, dto.updatedAt)
    }
  }

  // 待办（结构同便签）
  const localTodos = (await db.hub_todos.toArray()) as HubTodo[]
  const localTodoDtos: SyncTodoDto[] = []
  for (const r of localTodos) {
    const uuid = await lazyUuid('hub_todos', r.id!, r.updatedAt ?? now)
    localTodoDtos.push({ syncId: uuid.syncUuid, text: r.text, done: r.done, completedAt: r.completedAt ?? null, status: r.status, createdAt: r.createdAt ?? now, updatedAt: r.updatedAt ?? now, deleted: r.status === 'trashed' })
  }
  const mergedTodos = lastWriteWins(localTodoDtos, remote.todos, (t) => t.syncId, (t) => t.updatedAt)
  for (const dto of mergedTodos) {
    const existing = await mappingFor('hub_todos', dto.syncId)
    if (dto.deleted) {
      if (existing) {
        const row = await db.hub_todos.get(existing.localId as number)
        if (row) await db.hub_todos.update(row.id!, { status: 'trashed', updatedAt: dto.updatedAt })
      }
      continue
    }
    const row: HubTodo = {
      text: dto.text,
      done: dto.done,
      completedAt: dto.completedAt ?? undefined,
      status: (['active', 'archived', 'trashed'] as const).includes(dto.status as never) ? (dto.status as HubTodo['status']) : 'active',
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt
    }
    if (existing) {
      row.id = existing.localId as number
      await db.hub_todos.put(row)
    } else {
      const newId = await db.hub_todos.add(row)
      await bindUuid('hub_todos', dto.syncId, newId as number, dto.updatedAt)
    }
  }

  // 每日笔记：one per date，按日期合并
  const localDay = (await db.hub_day_notes.toArray()) as HubDayNote[]
  const localDayDto: SyncDayNoteDto[] = localDay.map((r) => ({
    syncId: `day:${r.date}`,
    date: r.date,
    content: r.content,
    createdAt: r.createdAt ?? now,
    updatedAt: r.createdAt ?? now,
    deleted: false
  }))
  const mergedDay = dedupeByKey(lastWriteWins(localDayDto, remote.dayNotes, (t) => t.date, (t) => t.updatedAt), (t) => t.date, (t) => t.updatedAt)
  for (const dto of mergedDay) {
    const existingRow = localDay.find((r) => r.date === dto.date)
    if (dto.deleted) {
      if (existingRow?.id) await db.hub_day_notes.delete(existingRow.id)
      continue
    }
    if (existingRow) {
      await db.hub_day_notes.update(existingRow.id!, { content: dto.content })
    } else {
      await db.hub_day_notes.add({ date: dto.date, content: dto.content, createdAt: dto.createdAt })
    }
  }

  // 习惯（id 即 UUID，直接匹配）
  const localHabits = (await db.habits.toArray()) as Habit[]
  const localHabitDtos: SyncHabitDto[] = localHabits.map((r) => ({
    syncId: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    order: r.order ?? 0,
    frequencyType: r.frequencyType ?? 'daily',
    timesPerWeek: r.timesPerWeek ?? null,
    daysOfWeek: r.daysOfWeek ?? null,
    archived: r.archived ?? false,
    createdAt: r.createdAt ?? now,
    updatedAt: r.createdAt ?? now,
    deleted: r.archived ?? false
  }))
  const mergedHabits = lastWriteWins(localHabitDtos, remote.habits, (t) => t.syncId, (t) => t.updatedAt)
  for (const dto of mergedHabits) {
    if (dto.deleted) {
      const row = localHabits.find((h) => h.id === dto.syncId)
      if (row) await db.habits.update(row.id, { archived: true })
      continue
    }
    const existing = localHabits.find((h) => h.id === dto.syncId)
    const row: Habit = { id: dto.syncId, name: dto.name, icon: dto.icon, color: dto.color, order: dto.order, frequencyType: dto.frequencyType as Habit['frequencyType'], timesPerWeek: dto.timesPerWeek ?? undefined, daysOfWeek: dto.daysOfWeek ?? undefined, archived: dto.archived, createdAt: dto.createdAt }
    if (existing) await db.habits.put(row)
    else await db.habits.add(row)
  }

  // 打卡记录（复合主键 [habitId+date]，按 habitSyncId+date 去重合并）
  const localRecords = (await db.habit_records.toArray()) as HabitRecord[]
  const localRecordDtos: SyncHabitRecordDto[] = localRecords.map((r) => ({
    syncId: `${r.habitId}:${r.date}`,
    habitSyncId: r.habitId,
    date: r.date,
    status: r.status,
    count: r.count ?? null,
    createdAt: r.createdAt ?? now,
    updatedAt: r.createdAt ?? now,
    deleted: false
  }))
  const mergedRecords = dedupeByKey(lastWriteWins(localRecordDtos, remote.habitRecords, (t) => t.syncId, (t) => t.updatedAt), (t) => `${t.habitSyncId}:${t.date}`, (t) => t.updatedAt)
  for (const dto of mergedRecords) {
    if (dto.deleted) {
      const row = localRecords.find((r) => r.habitId === dto.habitSyncId && r.date === dto.date)
      if (row) await db.habit_records.delete([row.habitId, row.date] as never)
      continue
    }
    const existing = localRecords.find((r) => r.habitId === dto.habitSyncId && r.date === dto.date)
    const row: HabitRecord = { habitId: dto.habitSyncId, date: dto.date, status: dto.status === 'done' ? 'done' : 'skip', count: dto.count ?? undefined, createdAt: dto.createdAt }
    if (existing) await db.habit_records.put(row)
    else await db.habit_records.add(row)
  }

  // 闹钟（映射固化 syncUuid ↔ id）
  const localAlarms = (await db.hub_alarms.toArray()) as HubAlarm[]
  const localAlarmDtos: SyncAlarmDto[] = []
  for (const r of localAlarms) {
    const { syncUuid, updatedAt } = await lazyUuid('hub_alarms', r.id!, now)
    localAlarmDtos.push({ syncId: syncUuid, h: r.h, m: r.m, s: r.s, enabled: r.enabled, label: r.label, sound: r.sound ?? null, date: r.date ?? null, lastTriggerKey: r.lastTriggerKey ?? null, createdAt: updatedAt, updatedAt, deleted: false })
  }
  const mergedAlarms = lastWriteWins(localAlarmDtos, remote.alarms, (t) => t.syncId, (t) => t.updatedAt)
  for (const dto of mergedAlarms) {
    const existing = await mappingFor('hub_alarms', dto.syncId)
    if (dto.deleted) {
      if (existing) {
        const row = await db.hub_alarms.get(existing.localId as number)
        if (row) await db.hub_alarms.delete(row.id!)
      }
      continue
    }
    const row: HubAlarm = { h: dto.h, m: dto.m, s: dto.s, enabled: dto.enabled, triggered: false, label: dto.label, sound: dto.sound ?? '', date: dto.date ?? undefined, lastTriggerKey: dto.lastTriggerKey ?? undefined }
    if (existing) {
      row.id = existing.localId as number
      await db.hub_alarms.put(row)
    } else {
      const newId = await db.hub_alarms.add(row)
      await bindUuid('hub_alarms', dto.syncId, newId as number, dto.updatedAt)
    }
  }

  await states.put({ key: 'last_import_at', value: String(now) })
}

// ---------- 传输（经 window.api.sync，主进程 CherrySyncStorage） ----------
function syncApi() {
  return (window as unknown as { api: { sync: { getFile: (c: string, cfg: unknown, k: string) => Promise<{ ok: boolean; data?: string; error?: string }>; putFile: (c: string, cfg: unknown, k: string, v: string) => Promise<{ ok: boolean; error?: string }> } } }).api.sync
}

function filesOf(bundle: SyncBundle): Array<[string, string]> {
  return [
    [SYNC_FILES.notes, JSON.stringify(bundle.notes)],
    [SYNC_FILES.todos, JSON.stringify(bundle.todos)],
    [SYNC_FILES.dayNotes, JSON.stringify(bundle.dayNotes)],
    [SYNC_FILES.habits, JSON.stringify(bundle.habits)],
    [SYNC_FILES.habitRecords, JSON.stringify(bundle.habitRecords)],
    [SYNC_FILES.alarms, JSON.stringify(bundle.alarms)]
  ]
}

export async function syncOnce(config: SyncConfigDto): Promise<SyncResult> {
  const api = syncApi()
  const channel = config.channel
  if (channel === 'none') return { ok: false, message: '未配置同步通道' }
  const creds = channel === 's3' ? config.s3 : config.webdav
  if (!creds) return { ok: false, message: `${channel} 配置为空` }

  const empty: SyncBundle = { notes: [], todos: [], dayNotes: [], habits: [], habitRecords: [], alarms: [] }
  try {
    // 1. 下载 + 合并导入
    const remote: SyncBundle = { ...empty }
    const results = await Promise.all(
      filesOf(empty).map(async ([key]) => {
        const res = await api.getFile(channel, creds, key)
        if (res.ok && res.data) {
          try {
            return [key, JSON.parse(res.data)] as const
          } catch {
            return [key, []] as const
          }
        }
        return [key, []] as const
      })
    )
    for (const [key, list] of results) {
      if (key === SYNC_FILES.notes) remote.notes = list as SyncNoteDto[]
      if (key === SYNC_FILES.todos) remote.todos = list as SyncTodoDto[]
      if (key === SYNC_FILES.dayNotes) remote.dayNotes = list as SyncDayNoteDto[]
      if (key === SYNC_FILES.habits) remote.habits = list as SyncHabitDto[]
      if (key === SYNC_FILES.habitRecords) remote.habitRecords = list as SyncHabitRecordDto[]
      if (key === SYNC_FILES.alarms) remote.alarms = list as SyncAlarmDto[]
    }
    await importAll(remote)

    // 2. 导出 + 上传
    const bundle = await exportAll()
    for (const [key, content] of filesOf(bundle)) {
      const res = await api.putFile(channel, creds, key, content)
      if (!res.ok) return { ok: false, message: `上传 ${key} 失败：${res.error ?? '未知错误'}` }
    }
    await states.put({ key: 'last_sync_at', value: String(Date.now()) })
    return { ok: true, message: '同步完成' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export function getSyncState(): { lastSyncAt?: string; lastImportAt?: string } {
  return {
    lastSyncAt: undefined,
    lastImportAt: undefined
  }
}

export async function loadSyncState(): Promise<{ lastSyncAt?: string; lastImportAt?: string }> {
  const items = await states.bulkGet(['last_sync_at', 'last_import_at'])
  return {
    lastSyncAt: items[0]?.value,
    lastImportAt: items[1]?.value
  }
}

// 供懒引用，避免未使用告警
export type { Table }