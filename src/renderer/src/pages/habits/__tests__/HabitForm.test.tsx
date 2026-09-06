/**
 * HabitForm 表单测试（无界面）：
 * - 图标 ≥ 32 个、颜色 ≥ 20 个（需求：比初版 16 图标/10 颜色至少翻一倍）
 * - 新增：备注随表单写入（留空则不写字段）
 * - 编辑：备注回填；清空备注保存 → patch 中 note 为 undefined（真正清掉）
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Habit } from '../types'

const { addHabitMock, updateHabitMock } = vi.hoisted(() => ({
  addHabitMock: vi.fn().mockResolvedValue('new-id'),
  updateHabitMock: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../services/habitService', () => ({
  addHabit: addHabitMock,
  updateHabit: updateHabitMock
}))

import HabitForm from '../components/HabitForm'

const editingHabit: Habit = {
  id: 'a',
  name: '喝水',
  note: '每天至少 2000ml',
  icon: '💧',
  color: '#2F7ED8',
  order: 1,
  archived: false,
  createdAt: 0,
  frequencyType: 'daily'
}

const NOTE_PLACEHOLDER = '如：每天至少 2000ml / 睡前拉伸 10 分钟'

const noop = () => {}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('HabitForm：图标与色板规模（翻倍需求）', () => {
  it('图标 ≥ 32 个（初版 16 的两倍以上）', () => {
    render(<HabitForm open onClose={noop} />)
    expect(screen.getByTestId('emoji-grid').children.length).toBeGreaterThanOrEqual(32)
  })

  it('颜色 ≥ 20 个（初版 10 的两倍以上）', () => {
    const { container } = render(<HabitForm open onClose={noop} />)
    expect(container.querySelectorAll('button[aria-label^="#"]').length).toBeGreaterThanOrEqual(20)
  })
})

describe('HabitForm：备注（note）', () => {
  it('新增时填写备注 → 保存随 addHabit 写入', async () => {
    render(<HabitForm open onClose={noop} />)
    fireEvent.change(screen.getByPlaceholderText('如：戒烟 / 喝水 / 运动'), { target: { value: '喝水' } })
    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), { target: { value: '  睡前拉伸 10 分钟  ' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(addHabitMock).toHaveBeenCalledTimes(1))
    // 备注去空白后原样写入
    expect(addHabitMock).toHaveBeenCalledWith({
      name: '喝水',
      icon: '🚭',
      color: '#C43D3D',
      note: '睡前拉伸 10 分钟'
    })
  })

  it('新增时备注留空 → addHabit 收到 undefined（不写空串进库）', async () => {
    render(<HabitForm open onClose={noop} />)
    fireEvent.change(screen.getByPlaceholderText('如：戒烟 / 喝水 / 运动'), { target: { value: '运动' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(addHabitMock).toHaveBeenCalledTimes(1))
    expect(addHabitMock).toHaveBeenCalledWith({
      name: '运动',
      icon: '🚭',
      color: '#C43D3D',
      note: undefined
    })
  })

  it('编辑时备注回填输入框（老数据无 note 字段也不崩）', () => {
    const first = render(<HabitForm open editing={editingHabit} onClose={noop} />)
    expect(screen.getByPlaceholderText(NOTE_PLACEHOLDER)).toHaveValue('每天至少 2000ml')
    first.unmount()
    // 老数据防御：note 为 undefined 时回填空串
    render(<HabitForm open editing={{ ...editingHabit, note: undefined }} onClose={noop} />)
    expect(screen.getByPlaceholderText(NOTE_PLACEHOLDER)).toHaveValue('')
  })

  it('编辑时清空备注 → updateHabit 的 patch 里 note 为 undefined（真正清掉）', async () => {
    render(<HabitForm open editing={editingHabit} onClose={noop} />)
    fireEvent.change(screen.getByPlaceholderText(NOTE_PLACEHOLDER), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(updateHabitMock).toHaveBeenCalledTimes(1))
    expect(updateHabitMock).toHaveBeenCalledWith('a', {
      name: '喝水',
      icon: '💧',
      color: '#2F7ED8',
      note: undefined
    })
  })
})
