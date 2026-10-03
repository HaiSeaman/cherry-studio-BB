import { db } from '@renderer/databases'

import { toISODate } from './calendarUtils'

/** 当日便签/待办活跃度 +1（Dexie 事务） */
export async function bumpActivity(field: 'note' | 'todo'): Promise<void> {
  const date = toISODate(new Date())
  await db.transaction('rw', db.hub_activity, async () => {
    const row = await db.hub_activity.get(date)
    if (row) {
      await db.hub_activity.update(date, field === 'note' ? { note: row.note + 1 } : { todo: row.todo + 1 })
    } else {
      await db.hub_activity.add({ date, note: field === 'note' ? 1 : 0, todo: field === 'todo' ? 1 : 0 })
    }
  })
}

/** 列表预览文本：去空白后按上限截断 */
export function previewText(text: string, max: number): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max) : t
}