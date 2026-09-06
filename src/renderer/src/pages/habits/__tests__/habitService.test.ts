import { describe, expect, it } from 'vitest'

import { addDaysISO, todayISO } from '../services/calendar'
import { parseHabitsBackup } from '../services/habitService'

// 导入是替换式写库（不可逆），parseHabitsBackup 是唯一防线：任何行损坏必须在写入前抛错

const validHabit = {
  id: 'a',
  name: '戒烟',
  icon: '🚭',
  color: '#D85A30',
  order: 1,
  archived: false,
  createdAt: 1754000000000,
  frequencyType: 'daily'
}

// 日期取"昨天"：始终落在创建日 ~ 今天的合法窗口内，不随跑测试的日期漂移失效
const validRecord = { habitId: 'a', date: addDaysISO(todayISO(), -1), status: 'done', createdAt: 1754000000000 }

describe('parseHabitsBackup', () => {
  it('合法备份原样通过', () => {
    const backup = parseHabitsBackup(
      JSON.stringify({ version: 1, exportedAt: 1, habits: [validHabit], records: [validRecord] })
    )
    expect(backup.habits).toHaveLength(1)
    expect(backup.records[0]?.date).toBe(validRecord.date)
  })

  it('空数组合法（空备份）', () => {
    const backup = parseHabitsBackup(JSON.stringify({ version: 1, habits: [], records: [] }))
    expect(backup.habits).toHaveLength(0)
  })

  it('版本号不符 / 缺字段 / 非数组 → 拒绝', () => {
    expect(() => parseHabitsBackup(JSON.stringify({ version: 2, habits: [], records: [] }))).toThrow()
    expect(() => parseHabitsBackup(JSON.stringify({ habits: [], records: [] }))).toThrow()
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: {}, records: [] }))).toThrow()
  })

  it('记录日期非补零 ISO 格式 → 拒绝（会破坏月历 between 查询与排序）', () => {
    const bad = [{ ...validRecord, date: '2026-9-1' }]
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: [validHabit], records: bad }))).toThrow()
  })

  it('记录日期早于习惯创建日 → 拒绝（污染漏卡判定与完成率口径）', () => {
    const bad = [{ ...validRecord, date: '2020-01-01' }] // 远早于 validHabit 的创建时间（2025-08 前后）
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: [validHabit], records: bad }))).toThrow()
  })

  it('记录日期在未来 → 拒绝（未来格子不可打卡，写入即污染日历）', () => {
    const bad = [{ ...validRecord, date: addDaysISO(todayISO(), 1) }]
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: [validHabit], records: bad }))).toThrow()
  })

  it('记录状态非法 → 拒绝', () => {
    const bad = [{ ...validRecord, status: 'oops' }]
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: [validHabit], records: bad }))).toThrow()
  })

  it('习惯行缺 archived 布尔 → 拒绝', () => {
    const { archived: _omit, ...bad } = validHabit
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: [bad], records: [] }))).toThrow()
  })

  it('记录引用不存在的习惯 id（孤儿记录）→ 拒绝', () => {
    const bad = [{ ...validRecord, habitId: 'ghost' }]
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: [validHabit], records: bad }))).toThrow()
  })

  it('非 JSON 文本 → 抛解析错误', () => {
    expect(() => parseHabitsBackup('not json')).toThrow()
  })

  it('备注字段：有 note 的新备份通过，无 note 的老备份也通过（向后兼容）', () => {
    const withNote = [{ ...validHabit, note: '每天至少 2000ml' }]
    expect(() =>
      parseHabitsBackup(JSON.stringify({ version: 1, habits: withNote, records: [validRecord] }))
    ).not.toThrow()
    expect(parseHabitsBackup(JSON.stringify({ version: 1, habits: withNote, records: [] })).habits[0]?.note).toBe(
      '每天至少 2000ml'
    )
    expect(() =>
      parseHabitsBackup(JSON.stringify({ version: 1, habits: [validHabit], records: [] }))
    ).not.toThrow()
  })

  it('备注字段类型损坏（非字符串）→ 拒绝', () => {
    const bad = [{ ...validHabit, note: 123 }]
    expect(() => parseHabitsBackup(JSON.stringify({ version: 1, habits: bad, records: [] }))).toThrow()
  })
})
