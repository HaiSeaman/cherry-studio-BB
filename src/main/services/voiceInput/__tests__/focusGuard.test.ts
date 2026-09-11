import { beforeEach, describe, expect, it, vi } from 'vitest'

const { uiohookMock, lastInjection } = vi.hoisted(() => {
  const handlers = new Map<string, Set<(data?: unknown) => void>>()
  return {
    uiohookMock: {
      on: vi.fn((event: string, fn: (data?: unknown) => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set())
        handlers.get(event)?.add(fn)
      }),
      off: vi.fn((event: string, fn: (data?: unknown) => void) => {
        handlers.get(event)?.delete(fn)
      }),
      emit: (event: string, data?: unknown) => {
        for (const fn of handlers.get(event) ?? []) fn(data)
      },
      reset: () => handlers.clear()
    },
    lastInjection: { value: 0 }
  }
})

vi.mock('uiohook-napi', () => ({ uIOhook: uiohookMock }))
vi.mock('../textInserter', () => ({
  getLastInjectionAt: () => lastInjection.value,
  typeTextAtCursor: vi.fn(),
  backspaceAtCursor: vi.fn()
}))

import { createFocusGuard, INJECTION_ECHO_MS, isUserInputEvent } from '../focusGuard'

const keydown = (keycode: number) => ({ keycode, time: Date.now() })
const keyup = (keycode: number) => ({ keycode, time: Date.now() })

/** 让后续事件都被视为「用户真实输入」（最近一次注入是很久以前） */
const noRecentInjection = () => {
  lastInjection.value = Date.now() - 10_000
}

beforeEach(() => {
  uiohookMock.on.mockClear()
  uiohookMock.off.mockClear()
  uiohookMock.reset()
  lastInjection.value = 0
})

describe('isUserInputEvent', () => {
  it('注入回声窗口内的事件不算用户输入', () => {
    const now = Date.now()
    expect(isUserInputEvent(now, now)).toBe(false)
    expect(isUserInputEvent(now, now - INJECTION_ECHO_MS)).toBe(false)
  })

  it('超出回声窗口的事件算用户输入', () => {
    expect(isUserInputEvent(Date.now(), Date.now() - INJECTION_ECHO_MS - 1)).toBe(true)
  })
})

describe('createFocusGuard', () => {
  it('start 注册键鼠监听、stop 全部注销', () => {
    const guard = createFocusGuard(vi.fn())
    guard.start([41])
    expect(uiohookMock.on).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(uiohookMock.on).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(uiohookMock.on).toHaveBeenCalledWith('mousedown', expect.any(Function))

    guard.stop()
    expect(uiohookMock.off).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(uiohookMock.off).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(uiohookMock.off).toHaveBeenCalledWith('mousedown', expect.any(Function))
  })

  it('用户点击鼠标 → 冻结回调', () => {
    const onUserInput = vi.fn()
    createFocusGuard(onUserInput).start([])
    noRecentInjection()

    uiohookMock.emit('mousedown')
    expect(onUserInput).toHaveBeenCalledTimes(1)
  })

  it('用户按下其它键 → 冻结回调', () => {
    const onUserInput = vi.fn()
    createFocusGuard(onUserInput).start([])
    noRecentInjection()

    uiohookMock.emit('keydown', keydown(30)) // A
    expect(onUserInput).toHaveBeenCalledTimes(1)
  })

  it('长按自动重复（同键连续 keydown）只算一次用户输入', () => {
    const onUserInput = vi.fn()
    createFocusGuard(onUserInput).start([])
    noRecentInjection()

    uiohookMock.emit('keydown', keydown(41))
    uiohookMock.emit('keydown', keydown(41))
    uiohookMock.emit('keydown', keydown(41))
    expect(onUserInput).toHaveBeenCalledTimes(1)

    // 松手后再按才算新的一次输入
    uiohookMock.emit('keyup', keyup(41))
    uiohookMock.emit('keydown', keydown(41))
    expect(onUserInput).toHaveBeenCalledTimes(2)
  })

  it('快捷键处于按住状态时，它的自动重复不算用户输入', () => {
    const onUserInput = vi.fn()
    createFocusGuard(onUserInput).start([41, 3675, 42]) // 反引号 + Win + Shift
    noRecentInjection()

    uiohookMock.emit('keydown', keydown(41)) // 长按反引号的重复事件
    uiohookMock.emit('keydown', keydown(3675)) // Win 键事件
    expect(onUserInput).not.toHaveBeenCalled()
  })

  it('紧跟我们自己注入的键鼠事件视为回声，不触发冻结', () => {
    const onUserInput = vi.fn()
    createFocusGuard(onUserInput).start([])
    lastInjection.value = Date.now() // 刚刚注入过（退格/打字）

    uiohookMock.emit('keydown', keydown(14)) // 我们自己发的退格回声
    uiohookMock.emit('mousedown')
    expect(onUserInput).not.toHaveBeenCalled()
  })

  it('stop 之后不再回调（监听已真正注销）', () => {
    const onUserInput = vi.fn()
    const guard = createFocusGuard(onUserInput)
    guard.start([])
    guard.stop()
    noRecentInjection()

    uiohookMock.emit('mousedown')
    uiohookMock.emit('keydown', keydown(30))
    expect(onUserInput).not.toHaveBeenCalled()
  })
})
