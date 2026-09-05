import { describe, expect, it } from 'vitest'

import { migrate } from '../migrate'

/** 构造带 sidebarIcons 的持久化 state */
function stateWith(visible: string[] | undefined, disabled?: string[]) {
  return {
    settings: {
      sidebarIcons: visible === undefined && disabled === undefined ? undefined : { visible, disabled: disabled ?? [] }
    }
  }
}

describe('persist migrate — 侧边栏图标（v0~v3 → v4 各历史升级路径）', () => {
  it('v1 老数据（含 music/paint/automation）：过滤后 notes 保留，并默认补入 habits/knowledge/iptv', async () => {
    const s = stateWith(['assistants', 'minapp', 'paint', 'music', 'notes', 'automation'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.visible).toEqual(['assistants', 'minapp', 'notes', 'habits', 'knowledge', 'iptv'])
  })

  it('v0 极老数据（无 paint/automation，仅 music）：notes 保留，并默认补入 habits/knowledge/iptv', async () => {
    const s = stateWith(['assistants', 'minapp', 'music', 'notes'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.visible).toEqual(['assistants', 'minapp', 'notes', 'habits', 'knowledge', 'iptv'])
  })

  it('disabled 列表中的死图标同样被清除', async () => {
    const s = stateWith(['assistants', 'minapp', 'notes'], ['paint', 'music'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.disabled).toEqual([])
  })

  it('已是最新格式（3 图标）：原样放行 + 默认补入 habits/knowledge/iptv，notes 不丢', async () => {
    const s = stateWith(['assistants', 'minapp', 'notes'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.visible).toEqual(['assistants', 'minapp', 'notes', 'habits', 'knowledge', 'iptv'])
  })

  it('用户已显式禁用 knowledge：不强行补入 visible', async () => {
    const s = stateWith(['assistants', 'minapp', 'notes', 'habits'], ['knowledge'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.visible).not.toContain('knowledge')
    expect(out.settings.sidebarIcons.disabled).toContain('knowledge')
  })

  it('visible 已含 knowledge：不重复添加', async () => {
    const s = stateWith(['assistants', 'minapp', 'notes', 'habits', 'knowledge'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.visible.filter((i: string) => i === 'knowledge')).toHaveLength(1)
  })

  it('用户已显式禁用 iptv：不强行补入 visible', async () => {
    const s = stateWith(['assistants', 'minapp', 'notes', 'habits', 'knowledge'], ['iptv'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.visible).not.toContain('iptv')
    expect(out.settings.sidebarIcons.disabled).toContain('iptv')
  })

  it('visible 已含 iptv：不重复添加', async () => {
    const s = stateWith(['assistants', 'minapp', 'notes', 'habits', 'knowledge', 'iptv'])
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons.visible.filter((i: string) => i === 'iptv')).toHaveLength(1)
  })

  it('settings 无 sidebarIcons 字段（更老的数据）：不崩溃、原样返回', async () => {
    const s = stateWith(undefined)
    const out: any = await migrate(s)
    expect(out.settings.sidebarIcons).toBeUndefined()
  })

  it('state 为 null：原样返回', async () => {
    expect(await migrate(null)).toBeNull()
  })
})

describe('persist migrate — 通知设置（老布尔 → 新 { enabled, sound } 结构 + 补 paint/automation 默认值）', () => {
  it('老布尔数据（assistant/backup）：转新结构，automation/paint 补默认', async () => {
    const s = { settings: { notification: { assistant: false, backup: true } } }
    const out: any = await migrate(s)
    expect(out.settings.notification).toEqual({
      assistant: { enabled: false, sound: 'default' },
      backup: { enabled: true, sound: 'default' },
      update: { enabled: false, sound: 'default' },
      automation: { enabled: true, sound: 'default' },
      paint: { enabled: false, sound: 'default' }
    })
  })

  it('新数据已含 enabled/sound + automation=false（用户主动关闭）：原样保留不覆盖', async () => {
    const s = {
      settings: {
        notification: {
          assistant: { enabled: false, sound: 'custom:C:\\sounds\\a.mp3' },
          backup: { enabled: false, sound: 'default' },
          automation: { enabled: false, sound: 'default' },
          update: { enabled: false, sound: 'default' },
          paint: { enabled: false, sound: 'default' }
        }
      }
    }
    const out: any = await migrate(s)
    expect(out.settings.notification.assistant).toEqual({ enabled: false, sound: 'custom:C:\\sounds\\a.mp3' })
    expect(out.settings.notification.automation.enabled).toBe(false)
    expect(out.settings.notification.paint.enabled).toBe(false)
  })

  it('新数据缺少某来源（如 paint）：补默认', async () => {
    const s = {
      settings: {
        notification: {
          assistant: { enabled: true, sound: 'default' },
          backup: { enabled: false, sound: 'default' },
          update: { enabled: false, sound: 'default' },
          automation: { enabled: true, sound: 'default' }
        }
      }
    }
    const out: any = await migrate(s)
    expect(out.settings.notification.paint).toEqual({ enabled: false, sound: 'default' })
  })

  it('settings 无 notification 字段（极老数据）：补完整默认值', async () => {
    const s = { settings: {} }
    const out: any = await migrate(s)
    expect(out.settings.notification).toEqual({
      assistant: { enabled: false, sound: 'default' },
      backup: { enabled: false, sound: 'default' },
      update: { enabled: false, sound: 'default' },
      automation: { enabled: true, sound: 'default' },
      paint: { enabled: false, sound: 'default' }
    })
  })

  it('settings 整体缺失：原样返回（autoMerge 用 initialState，默认值本就完整）', async () => {
    const out: any = await migrate({ assistants: [] })
    expect(out.settings).toBeUndefined()
    expect(out).toEqual({ assistants: [] })
  })
})
