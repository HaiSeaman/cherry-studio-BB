import { beforeEach, describe, expect, it, vi } from 'vitest'

const { hookMock, mainWindowSend, startSpy } = vi.hoisted(() => ({
  hookMock: { start: vi.fn(), stop: vi.fn(), dispose: vi.fn(), updateShortcut: vi.fn() },
  mainWindowSend: vi.fn(),
  startSpy: vi.fn()
}))

vi.mock('../../WindowService', () => ({
  windowService: { getMainWindow: () => ({ webContents: { send: mainWindowSend } }) }
}))

vi.mock('../VoiceInputService', () => ({
  voiceInputService: { start: startSpy }
}))

vi.mock('../keyboardHook', () => ({
  createVoiceKeyboardHook: vi.fn(() => hookMock),
  parseShortcutToKeycodes: vi.fn(() => [29, 41]),
  UiohookKey: {}
}))

import type { Shortcut } from '@types'

import { createVoiceKeyboardHook } from '../keyboardHook'
import { voiceKeyboardManager } from '../voiceKeyboardManager'

const makeShortcut = (enabled: boolean, keys: string[] = ['Ctrl', '`']): Shortcut =>
  ({ key: 'voice_input', shortcut: keys, enabled, system: true, editable: true }) as Shortcut

describe('voiceKeyboardManager.sync — 开关是否真的启停全局钩子', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    voiceKeyboardManager.dispose()
  })

  it('enabled=true 且有按键 → 创建并启动钩子', () => {
    voiceKeyboardManager.sync(makeShortcut(true))
    expect(createVoiceKeyboardHook).toHaveBeenCalledTimes(1)
    expect(hookMock.start).toHaveBeenCalledTimes(1)
  })

  it('enabled=false → 不创建钩子（关掉开关后不会再录音）', () => {
    voiceKeyboardManager.sync(makeShortcut(false))
    expect(createVoiceKeyboardHook).not.toHaveBeenCalled()
    expect(hookMock.start).not.toHaveBeenCalled()
  })

  it('由开到关 → 销毁已有钩子', () => {
    voiceKeyboardManager.sync(makeShortcut(true))
    expect(hookMock.start).toHaveBeenCalledTimes(1)

    voiceKeyboardManager.sync(makeShortcut(false))
    expect(hookMock.dispose).toHaveBeenCalledTimes(1)
  })

  it('enabled=true 但快捷键为空 → 也不启动', () => {
    voiceKeyboardManager.sync(makeShortcut(true, []))
    expect(createVoiceKeyboardHook).not.toHaveBeenCalled()
  })

  it('已启动且快捷键未变时再 sync：不重建、不重连钩子（避免窗口 focus/blur 反复重连丢事件）', () => {
    voiceKeyboardManager.sync(makeShortcut(true))
    voiceKeyboardManager.sync(makeShortcut(true))
    expect(createVoiceKeyboardHook).toHaveBeenCalledTimes(1)
    expect(hookMock.updateShortcut).not.toHaveBeenCalled()
  })

  it('快捷键真的变了再 sync 才重建检测器', () => {
    voiceKeyboardManager.sync(makeShortcut(true, ['Ctrl', '`']))
    voiceKeyboardManager.sync(makeShortcut(true, ['Alt', '`']))
    expect(createVoiceKeyboardHook).toHaveBeenCalledTimes(1)
    expect(hookMock.updateShortcut).toHaveBeenCalledTimes(1)
  })
})
