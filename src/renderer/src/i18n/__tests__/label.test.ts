import { describe, expect, it } from 'vitest'

import { getShortcutLabel } from '../label'

describe('getShortcutLabel（快捷键设置页显示名）', () => {
  it('语音输入显示为「语音输入法」，而不是配置里的 voice_input', () => {
    expect(getShortcutLabel('voice_input')).toBe('语音输入法')
  })

  it('已登记的快捷键返回中文名', () => {
    expect(getShortcutLabel('desktop_widget')).toBe('桌面助手')
    expect(getShortcutLabel('show_settings')).toBe('打开设置')
    expect(getShortcutLabel('selection_assistant_toggle')).toBe('开关划词助手')
  })

  it('未登记的 key 原样返回，界面不会出现 undefined', () => {
    expect(getShortcutLabel('not_registered_key')).toBe('not_registered_key')
  })
})
