/**
 * 倒计时引擎（应用级单例）行为测试（假时钟 + 假 AudioContext，无界面）：
 * - start 递减、归零触发全局响铃（fireExternal）且带上 label
 * - pause 冻结 / resume 按剩余秒数续走
 * - reset 清空且不响铃
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/databases', () => ({
  db: {
    hub_alarms: {
      update: vi.fn(async () => 1),
      toCollection: () => ({ modify: vi.fn(async () => 1) })
    }
  }
}))

class FakeAudioContext {
  destination = {}
  state = 'running'
  currentTime = 0
  resume = vi.fn(async () => {})
  createGain = () => ({
    gain: {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {}
    },
    connect: () => {}
  })
  createOscillator = () => ({
    type: 'sine',
    frequency: { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {} },
    connect: () => {},
    start: () => {},
    stop: () => {}
  })
  createBufferSource = () => ({
    buffer: null,
    loop: false,
    connect: () => {},
    start: () => {},
    stop: () => {},
    disconnect: () => {}
  })
  decodeAudioData = vi.fn(async () => null)
}

import { alarmScheduler } from '../services/alarmScheduler'
import { countdownEngine } from '../services/countdownEngine'

beforeAll(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.useFakeTimers()
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-06T08:00:00'))
  countdownEngine.reset()
  alarmScheduler.resetForTest()
  alarmScheduler.stopRinging()
})

describe('倒计时引擎（应用级单例）', () => {
  it('start 后递减，归零触发全局响铃（与定时闹钟同一引擎）', () => {
    countdownEngine.start(0, 0, 3)
    expect(countdownEngine.getState().running).toBe(true)
    expect(countdownEngine.getState().remainSec).toBe(3)

    vi.advanceTimersByTime(3100)
    const st = countdownEngine.getState()
    expect(st.running).toBe(false)
    expect(st.remainSec).toBe(0)
    expect(alarmScheduler.getRinging()).not.toBeNull()
  })

  it('归零响铃带上 start 时的 label/sound（横幅文案依据）', () => {
    countdownEngine.start(0, 0, 1, '泡面好了', 'nokia')
    vi.advanceTimersByTime(1500)
    const ringing = alarmScheduler.getRinging()
    expect(ringing?.label).toBe('泡面好了')
    expect(ringing?.fromTimer).toBe(true)
  })

  it('pause 冻结计时；resume 以剩余秒数重算截止时刻继续倒计时', () => {
    countdownEngine.start(0, 0, 10)
    vi.advanceTimersByTime(2000)
    countdownEngine.pause()
    expect(countdownEngine.getState().running).toBe(false)
    expect(countdownEngine.getState().remainSec).toBe(8)

    // 暂停期间时间流逝也不倒
    vi.advanceTimersByTime(60_000)
    expect(countdownEngine.getState().remainSec).toBe(8)

    countdownEngine.resume()
    expect(countdownEngine.getState().running).toBe(true)
    vi.advanceTimersByTime(8000)
    expect(countdownEngine.getState().remainSec).toBe(0)
    expect(alarmScheduler.getRinging()).not.toBeNull()
  })

  it('reset 清空状态且不再响铃', () => {
    countdownEngine.start(0, 0, 10)
    vi.advanceTimersByTime(1000)
    countdownEngine.reset()
    expect(countdownEngine.getState()).toEqual({ remainSec: 0, totalSec: 0, running: false })
    vi.advanceTimersByTime(30_000)
    expect(alarmScheduler.getRinging()).toBeNull()
  })
})
