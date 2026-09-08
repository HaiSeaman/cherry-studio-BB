import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 保留真实 UiohookKey 枚举（需要真实 keycode），但把 uIOhook 单例换成 mock
vi.mock('uiohook-napi', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('uiohook-napi')
  return {
    ...actual,
    uIOhook: { on: vi.fn(), off: vi.fn(), start: vi.fn(), stop: vi.fn() }
  }
})

import { uIOhook,UiohookKey } from 'uiohook-napi'

import { createVoiceKeyboardHook, parseShortcutToKeycodes } from '../keyboardHook'

// 记录 uIOhook.on 注册的处理器，便于测试里模拟按键
const handlers = new Map<string, (e: unknown) => void>()
const mockOn = vi.mocked(uIOhook.on)

beforeEach(() => {
  handlers.clear()
  mockOn.mockImplementation((event: any, handler: any) => {
    handlers.set(event, handler)
    return uIOhook
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('parseShortcutToKeycodes', () => {
  it('把项目快捷键表的 Meta/Shift/反引号 映射成 uiohook keycode', () => {
    const codes = parseShortcutToKeycodes(['Meta', 'Shift', '`'])
    expect(codes).toEqual([UiohookKey.Meta, UiohookKey.Shift, UiohookKey.Backquote])
  })

  it('未知键名被过滤掉', () => {
    expect(parseShortcutToKeycodes(['Meta', 'NotAKey'])).toEqual([UiohookKey.Meta])
  })
})

describe('createVoiceKeyboardHook', () => {
  it('start 注册 keydown/keyup 并启动钩子；stop 注销并停止', () => {
    const hook = createVoiceKeyboardHook(['Meta', 'Shift', '`'], vi.fn(), vi.fn())

    hook.start()
    expect(mockOn).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(uIOhook.start).toHaveBeenCalledTimes(1)

    hook.stop()
    expect(uIOhook.off).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(uIOhook.off).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(uIOhook.stop).toHaveBeenCalledTimes(1)
  })

  it('start 幂等：重复 start 只注册一次', () => {
    const hook = createVoiceKeyboardHook(['Meta', 'Shift', '`'], vi.fn(), vi.fn())
    hook.start()
    hook.start()
    expect(mockOn).toHaveBeenCalledTimes(2)
    expect(uIOhook.start).toHaveBeenCalledTimes(1)
  })

  it('按下组合键→防抖后触发 onStart；松开→防抖后触发 onStop（经 uIOhook 事件转发）', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const hook = createVoiceKeyboardHook(['Meta', 'Shift', '`'], onStart, onStop)
    hook.start()

    const keydown = handlers.get('keydown')!
    const keyup = handlers.get('keyup')!
    expect(keydown).toBeDefined()
    expect(keyup).toBeDefined()

    keydown({ keycode: UiohookKey.Meta })
    keydown({ keycode: UiohookKey.Shift })
    keydown({ keycode: UiohookKey.Backquote })
    vi.advanceTimersByTime(20)
    expect(onStart).toHaveBeenCalledTimes(1)

    keyup({ keycode: UiohookKey.Backquote })
    vi.advanceTimersByTime(50)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('dispose 后停止钩子且不再响应事件', () => {
    const onStart = vi.fn()
    const hook = createVoiceKeyboardHook(['Meta', 'Shift', '`'], onStart, vi.fn())
    hook.start()
    hook.dispose()

    expect(uIOhook.stop).toHaveBeenCalledTimes(1)
    const keydown = handlers.get('keydown')!
    keydown({ keycode: UiohookKey.Meta })
    keydown({ keycode: UiohookKey.Shift })
    keydown({ keycode: UiohookKey.Backquote })
    vi.advanceTimersByTime(200)
    expect(onStart).not.toHaveBeenCalled()
  })
})