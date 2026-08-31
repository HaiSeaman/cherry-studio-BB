import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Habit, HabitRecord } from '../types'

// 修复回归：月历日期列曾硬编码 31 列，9 月（30 天）等非 31 天月份整表错位。
// 本测试锁定「渲染天数 = 当月实际天数」及今天/未来边界逻辑。

const habit: Habit = {
  id: 'a',
  name: '戒烟',
  icon: '🚭',
  color: '#D85A30',
  order: 1,
  archived: false,
  createdAt: Date.parse('2026-08-01T00:00:00'),
  frequencyType: 'daily'
}

// 9 月中旬才创建的习惯：创建日之前的格子应禁用（不算漏卡、不可打卡）
const lateHabit: Habit = {
  ...habit,
  id: 'b',
  name: '喝水',
  icon: '💧',
  color: '#2F7ED8',
  order: 2,
  createdAt: Date.parse('2026-09-10T00:00:00')
}

const doneRecord: HabitRecord = { habitId: 'a', date: '2026-09-01', status: 'done', createdAt: 0 }

const toggleRecordMock = vi.fn().mockResolvedValue('added')

vi.mock('../hooks/useHabits', () => ({
  useActiveHabits: () => [habit, lateHabit],
  useMonthRecords: () => ({ byHabit: new Map<string, HabitRecord[]>([['a', [doneRecord]]]) }),
  useAllRecords: () => new Map([['a', { done: new Set(['2026-09-01']), skip: new Set<string>() }]])
}))

vi.mock('../services/habitService', () => ({
  toggleRecord: (...args: unknown[]) => toggleRecordMock(...(args as [string, string])),
  restoreRecord: vi.fn(),
  setSkip: vi.fn()
}))

const MonthCalendar = (await import('../components/MonthCalendar')).default

// 固定「今天」= 2026-09-01（周二）：当月即 30 天的 9 月
beforeAll(() => {
  vi.useFakeTimers({ now: new Date('2026-09-01T10:00:00') })
})
afterEach(() => {
  vi.clearAllMocks()
})

function setup() {
  return render(<MonthCalendar today="2026-09-01" onOpenDetail={() => {}} />)
}

describe('MonthCalendar（9 月 30 天回归）', () => {
  it('表头日期格数 = 当月实际天数（9 月 30 格，无第 31 格）', () => {
    const { container } = setup()
    const headers = container.querySelectorAll('[data-day]')
    expect(headers).toHaveLength(30)
    expect(headers[0]?.getAttribute('data-day')).toBe('1')
    expect(headers[29]?.getAttribute('data-day')).toBe('30')
  })

  it('表头含星期标注：2026-09-01 为周二', () => {
    const { container } = setup()
    expect(container.querySelector('[data-day="1"]')?.textContent).toContain('二')
  })

  it('每个习惯行渲染 30 个格子，与表头列数一致', () => {
    const { container } = setup()
    const cells = container.querySelectorAll('button[aria-label^="戒烟 "]')
    expect(cells).toHaveLength(30)
  })

  it('创建日之前的格子禁用且无漏卡提示（历史月仅受创建日约束）', () => {
    const { container } = setup()
    // 切到 8 月（历史月）：戒烟创建于 8-1，喝水创建于 9-10
    fireEvent.click(container.querySelector('button[aria-label="上一月"]') as HTMLButtonElement)
    const earlyHabitCell = container.querySelector('button[aria-label="戒烟 2026-08-15"]') as HTMLButtonElement
    const lateHabitCell = container.querySelector('button[aria-label="喝水 2026-08-15"]') as HTMLButtonElement
    expect(earlyHabitCell.disabled).toBe(false)
    expect(earlyHabitCell.getAttribute('title')).toContain('戒烟')
    expect(lateHabitCell.disabled).toBe(true)
    expect(lateHabitCell.getAttribute('title')).toBeNull()
  })

  it('今天（9-1）可点击且可打卡，未来（9-2）禁用不可点', () => {
    const { container } = setup()
    const todayCell = container.querySelector('button[aria-label="戒烟 2026-09-01"]') as HTMLButtonElement
    const futureCell = container.querySelector('button[aria-label="戒烟 2026-09-02"]') as HTMLButtonElement
    expect(todayCell).toBeTruthy()
    expect(todayCell.disabled).toBe(false)
    expect(futureCell.disabled).toBe(true)

    fireEvent.click(todayCell)
    expect(toggleRecordMock).toHaveBeenCalledWith('a', '2026-09-01')
  })

  it('月份标签显示 2026年 9月', () => {
    const { container } = setup()
    const text = container.textContent ?? ''
    expect(text).toContain('2026年')
    expect(text).toContain('9月')
  })
})
