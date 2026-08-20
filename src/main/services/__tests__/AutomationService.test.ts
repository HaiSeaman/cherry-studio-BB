import type { AutomationTask } from '@shared/automation'
import { describe, expect, it, vi } from 'vitest'

// AutomationService 单例引用 WindowService（electron），测试里 mock 掉
vi.mock('../WindowService', () => ({
  windowService: {
    getMainWindow: vi.fn(() => null)
  }
}))

// saveTask 会触发防抖写盘（500ms 后 fsp.writeFile），mock 掉避免测试环境文件 IO
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => {}),
  readFile: vi.fn(async () => ''),
  mkdir: vi.fn(async () => ''),
  stat: vi.fn(),
  readdir: vi.fn(),
  open: vi.fn(),
  close: vi.fn()
}))

import AutomationService, { normalizeTaskSchedules } from '../AutomationService'

// 只测调度判定与任务 CRUD 纯逻辑；类实例化不触发 Electron API（init 才会）
const svc = AutomationService as unknown as {
  evaluateSchedule: (task: AutomationTask, now: Date, nowMs: number) => 'due' | 'missed' | 'none'
  saveTask: (task: AutomationTask) => AutomationTask
  getTasks: () => AutomationTask[]
}

function makeTask(partial: Partial<AutomationTask>): AutomationTask {
  return {
    id: 't1',
    name: '测试任务',
    assistantId: 'a1',
    instruction: '测试',
    schedule: { type: 'daily', time: '08:00' },
    enabled: true,
    systemTools: [],
    useMcpTools: false,
    notifyOnComplete: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...partial
  }
}

describe('evaluateSchedule', () => {
  it('daily：时间未到 → none', () => {
    const now = new Date(2026, 7, 20, 7, 0, 0) // 07:00:00
    expect(svc.evaluateSchedule(makeTask({}), now, now.getTime())).toBe('none')
  })

  it('daily：90 秒窗口内 → due', () => {
    const now = new Date(2026, 7, 20, 8, 0, 30)
    expect(svc.evaluateSchedule(makeTask({}), now, now.getTime())).toBe('due')
  })

  it('daily：窗口尾沿 90 秒 → due', () => {
    const now = new Date(2026, 7, 20, 8, 1, 30)
    expect(svc.evaluateSchedule(makeTask({}), now, now.getTime())).toBe('due')
  })

  it('daily：窗口完全过去且今天未触发 → missed（错过即跳过）', () => {
    const now = new Date(2026, 7, 20, 9, 0, 0)
    expect(svc.evaluateSchedule(makeTask({}), now, now.getTime())).toBe('missed')
  })

  it('daily：今天已触发（lastTriggerKey）→ none', () => {
    const now = new Date(2026, 7, 20, 9, 0, 0)
    expect(svc.evaluateSchedule(makeTask({ lastTriggerKey: '2026-08-20' }), now, now.getTime())).toBe('none')
  })

  it('daily：非法时间格式 → none（不崩溃）', () => {
    const now = new Date(2026, 7, 20, 9, 0, 0)
    expect(svc.evaluateSchedule(makeTask({ schedule: { type: 'daily', time: '99:99' } }), now, now.getTime())).toBe(
      'none'
    )
  })

  // 2026-08-20 是周四（JS getDay()=4，weekly weekday=4）
  describe('weekly', () => {
    it('星期匹配 + 90 秒窗口内 → due', () => {
      const now = new Date(2026, 7, 20, 8, 0, 30)
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [4], time: '08:00' } }),
          now,
          now.getTime()
        )
      ).toBe('due')
    })

    it('星期不匹配（今天周四，任务定周五）→ none', () => {
      const now = new Date(2026, 7, 20, 8, 0, 30)
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [5], time: '08:00' } }),
          now,
          now.getTime()
        )
      ).toBe('none')
    })

    it('多选星期：今天不在所选星期内 → none', () => {
      const now = new Date(2026, 7, 20, 8, 0, 30) // 周四
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [1, 3, 5], time: '08:00' } }),
          now,
          now.getTime()
        )
      ).toBe('none')
    })

    it('多选星期：今天在所选星期内 → due', () => {
      const now = new Date(2026, 7, 20, 8, 0, 30) // 周四
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [1, 3, 4, 5], time: '08:00' } }),
          now,
          now.getTime()
        )
      ).toBe('due')
    })

    it('周日边界：weekday=7 → getDay()=0 匹配', () => {
      const now = new Date(2026, 7, 23, 8, 0, 30) // 2026-08-23 周日
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [7], time: '08:00' } }),
          now,
          now.getTime()
        )
      ).toBe('due')
    })

    it('星期匹配但窗口完全过去 → missed', () => {
      const now = new Date(2026, 7, 20, 9, 0, 0)
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [4], time: '08:00' } }),
          now,
          now.getTime()
        )
      ).toBe('missed')
    })

    it('当天已触发（lastTriggerKey）→ none', () => {
      const now = new Date(2026, 7, 20, 9, 0, 0)
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [4], time: '08:00' }, lastTriggerKey: '2026-08-20' }),
          now,
          now.getTime()
        )
      ).toBe('none')
    })

    it('空 weekdays → none（不崩溃，永不触发）', () => {
      const now = new Date(2026, 7, 20, 8, 0, 30)
      expect(
        svc.evaluateSchedule(
          makeTask({ schedule: { type: 'weekly', weekdays: [], time: '08:00' } }),
          now,
          now.getTime()
        )
      ).toBe('none')
    })
  })

  it('once：未到时间 → none', () => {
    const now = new Date(2026, 7, 20, 7, 0, 0)
    expect(
      svc.evaluateSchedule(makeTask({ schedule: { type: 'once', at: now.getTime() + 3600_000 } }), now, now.getTime())
    ).toBe('none')
  })

  it('once：窗口内 → due', () => {
    const now = new Date(2026, 7, 20, 8, 0, 30)
    expect(
      svc.evaluateSchedule(makeTask({ schedule: { type: 'once', at: now.getTime() - 30_000 } }), now, now.getTime())
    ).toBe('due')
  })

  it('once：错过窗口且从未运行 → missed', () => {
    const now = new Date(2026, 7, 20, 9, 0, 0)
    expect(
      svc.evaluateSchedule(makeTask({ schedule: { type: 'once', at: now.getTime() - 3600_000 } }), now, now.getTime())
    ).toBe('missed')
  })

  it('once：已运行过（lastRunAt）→ none', () => {
    const now = new Date(2026, 7, 20, 8, 0, 30)
    expect(
      svc.evaluateSchedule(
        makeTask({ schedule: { type: 'once', at: now.getTime() - 30_000 }, lastRunAt: now.getTime() - 30_000 }),
        now,
        now.getTime()
      )
    ).toBe('none')
  })

  it('interval：未到下次 → none', () => {
    const now = new Date(2026, 7, 20, 8, 0, 0)
    expect(
      svc.evaluateSchedule(
        makeTask({ schedule: { type: 'interval', everyMinutes: 60 }, lastRunAt: now.getTime() - 30 * 60_000 }),
        now,
        now.getTime()
      )
    ).toBe('none')
  })

  it('interval：到期 → due', () => {
    const now = new Date(2026, 7, 20, 8, 0, 0)
    expect(
      svc.evaluateSchedule(
        makeTask({ schedule: { type: 'interval', everyMinutes: 60 }, lastRunAt: now.getTime() - 61 * 60_000 }),
        now,
        now.getTime()
      )
    ).toBe('due')
  })

  it('interval：从 createdAt 起算（从未运行）→ due', () => {
    const now = new Date(2026, 7, 20, 8, 0, 0)
    expect(
      svc.evaluateSchedule(
        makeTask({ schedule: { type: 'interval', everyMinutes: 30 }, createdAt: now.getTime() - 31 * 60_000 }),
        now,
        now.getTime()
      )
    ).toBe('due')
  })
})

describe('normalizeTaskSchedules 旧数据归一化', () => {
  it('weekly 单选 weekday → weekdays 数组', () => {
    const task = makeTask({ schedule: { type: 'weekly', weekday: 3, time: '08:00' } as never })
    normalizeTaskSchedules([task])
    expect(task.schedule).toEqual({ type: 'weekly', weekdays: [3], time: '08:00' })
  })

  it('已是 weekdays 数组 → 不变（幂等）', () => {
    const task = makeTask({ schedule: { type: 'weekly', weekdays: [1, 3, 5], time: '08:00' } })
    normalizeTaskSchedules([task])
    expect(task.schedule).toEqual({ type: 'weekly', weekdays: [1, 3, 5], time: '08:00' })
  })

  it('非 weekly 调度 → 不变', () => {
    const task = makeTask({ schedule: { type: 'daily', time: '08:00' } })
    normalizeTaskSchedules([task])
    expect(task.schedule).toEqual({ type: 'daily', time: '08:00' })
  })

  it('老数据缺 weekday → weekdays 空数组（不崩溃）', () => {
    const task = makeTask({ schedule: { type: 'weekly', time: '08:00' } as never })
    normalizeTaskSchedules([task])
    expect(task.schedule).toEqual({ type: 'weekly', weekdays: [], time: '08:00' })
  })
})

describe('saveTask 消毒', () => {
  it('新建任务剔除渲染端带入的 lastRunAt/lastTriggerKey（复制任务场景）', () => {
    const source = makeTask({
      id: 'task_copy_1',
      name: '副本',
      lastRunAt: 1700000000000,
      lastTriggerKey: '2026-08-20',
      schedule: { type: 'daily', time: '08:00' }
    })
    const saved = svc.saveTask(source)
    expect(saved.lastRunAt).toBeUndefined()
    expect(saved.lastTriggerKey).toBeUndefined()
    expect(svc.getTasks().find((t) => t.id === 'task_copy_1')).toBeDefined()
  })

  it('interval 间隔 0/负数/小数 → 消毒为 ≥1 的整数分钟', () => {
    const saved0 = svc.saveTask(makeTask({ id: 'task_iv_0', schedule: { type: 'interval', everyMinutes: 0 } }))
    expect(saved0.schedule).toEqual({ type: 'interval', everyMinutes: 1 })
    const savedNeg = svc.saveTask(makeTask({ id: 'task_iv_neg', schedule: { type: 'interval', everyMinutes: -5 } }))
    expect(savedNeg.schedule).toEqual({ type: 'interval', everyMinutes: 1 })
    const savedFrac = svc.saveTask(makeTask({ id: 'task_iv_frac', schedule: { type: 'interval', everyMinutes: 2.9 } }))
    expect(savedFrac.schedule).toEqual({ type: 'interval', everyMinutes: 2 })
  })

  it('编辑任务：调度状态以主进程为准，不被渲染端覆盖', () => {
    svc.saveTask(makeTask({ id: 'task_edit' }))
    // 模拟调度器已推进的状态（调度状态只由主进程 triggerRun 写入）
    const stored = svc.getTasks().find((t) => t.id === 'task_edit')!
    stored.lastRunAt = 111
    stored.lastTriggerKey = '2026-01-01'
    const edited = svc.saveTask(
      makeTask({ id: 'task_edit', name: '改名', lastRunAt: 999, lastTriggerKey: '2099-12-31' })
    )
    expect(edited.name).toBe('改名')
    expect(edited.lastRunAt).toBe(111)
    expect(edited.lastTriggerKey).toBe('2026-01-01')
  })
})
