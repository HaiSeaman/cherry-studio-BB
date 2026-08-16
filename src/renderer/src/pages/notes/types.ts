export type HubNote = {
  id?: number
  content: string
  createdAt: number
  updatedAt: number
  status: 'active' | 'archived' | 'trashed'
  trashedAt?: number
  archivedAt?: number
}

export type HubTodo = {
  id?: number
  text: string
  done: boolean
  createdAt: number
  updatedAt: number
  completedAt?: number
  status: 'active' | 'archived' | 'trashed'
  archivedAt?: number
  trashedAt?: number
}

/** 单一闹钟数据源：定时闹钟无 date（每天可响）；日历闹钟带 date（仅指定日期触发） */
export type HubAlarm = {
  id?: number
  h: number
  m: number
  s: number
  enabled: boolean
  triggered: boolean
  label: string
  sound: string
  date?: string
  lastTriggerKey?: string
}

/** 日历当日待办（独立数据，与便签/待办模块互不关联） */
export type HubDayNote = {
  id?: number
  date: string
  content: string
  createdAt: number
}

export type HubActivity = {
  date: string
  note: number
  todo: number
}

export type HubNoteSnapshot = {
  id?: number
  noteId: number
  content: string
  ts: number
  locked: 0 | 1
}
