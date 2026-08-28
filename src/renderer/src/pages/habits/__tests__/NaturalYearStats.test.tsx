import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import NaturalYearStats from '../components/NaturalYearStats'
import type { HabitDateSets } from '../services/stats'
import type { Habit } from '../types'

const habitA: Habit = {
  id: 'a',
  name: '戒烟',
  icon: '🚭',
  color: '#D85A30',
  order: 1,
  archived: false,
  createdAt: Date.parse('2025-06-01T00:00:00'),
  frequencyType: 'daily'
}
const habitB: Habit = {
  id: 'b',
  name: '喝水',
  icon: '💧',
  color: '#3B82F6',
  order: 2,
  archived: false,
  createdAt: Date.parse('2025-06-01T00:00:00'),
  frequencyType: 'daily'
}

// 2026-08-29；A 在 2026 年 8 月打了 3 天，B 打了 1 天
const today = '2026-08-29'
const records = new Map<string, HabitDateSets>([
  [
    'a',
    {
      done: new Set(['2026-08-01', '2026-08-02', '2026-08-03']),
      skip: new Set(['2026-08-05'])
    }
  ],
  ['b', { done: new Set(['2026-08-10']), skip: new Set<string>() }]
])

describe('NaturalYearStats', () => {
  it('渲染模块标题与年份', () => {
    const { container } = render(<NaturalYearStats habits={[habitA]} allRecords={records} today={today} />)
    expect(container.textContent).toContain('自然年统计')
    expect(container.textContent).toContain('2026')
  })

  it('渲染按 order 排序的习惯 chips，默认选中第一个', () => {
    const { container } = render(<NaturalYearStats habits={[habitB, habitA]} allRecords={records} today={today} />)
    // chips 顺序 = order 升序：戒烟(a) 在 喝水(b) 前面
    const chips = Array.from(container.querySelectorAll('[data-chip]')).map((c) => c.textContent)
    expect(chips[0]).toContain('戒烟')
    expect(chips[1]).toContain('喝水')
    expect(container.querySelector('[data-chip].active')?.textContent).toContain('戒烟')
  })

  it('计数显示选中习惯的当年打卡天数：A=3 天', () => {
    const { container } = render(<NaturalYearStats habits={[habitA]} allRecords={records} today={today} />)
    expect(container.textContent).toContain('共打卡 3 天')
  })

  it('点击 habitB chip 后计数切换为 1 天', () => {
    const { container } = render(<NaturalYearStats habits={[habitA, habitB]} allRecords={records} today={today} />)
    fireEvent.click(container.querySelector('[data-chip="b"]') as HTMLElement)
    expect(container.querySelector('[data-chip].active')?.textContent).toContain('喝水')
    expect(container.textContent).toContain('共打卡 1 天')
  })

  it('热力图渲染该习惯全年格子，打卡日 title 含日期与状态', () => {
    const { container } = render(<NaturalYearStats habits={[habitA]} allRecords={records} today={today} />)
    const doneCell = container.querySelector('[data-cell="2026-08-02"]')
    expect(doneCell).toBeTruthy()
    expect(doneCell?.getAttribute('title')).toContain('8月2日')
    const skipCell = container.querySelector('[data-cell="2026-08-05"]')
    expect(skipCell?.getAttribute('title')).toContain('已跳过')
  })
})
