/**
 * 全局调度器响铃/停止仿真（假时钟 + 假 AudioContext，无界面）：
 * - 到点响铃 → 点一次「关闭闹钟」必须彻底安静（同批排队一并清空）
 * - 触发标记立即合并进内存：页面数据不回流（liveQuery 滞后/页面已卸载）也不得重复入队
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const dbUpdate = vi.hoisted(() => vi.fn(async () => 1))
const dbModify = vi.hoisted(() => vi.fn(async () => 1))

vi.mock('@renderer/databases', () => ({
  db: {
    hub_alarms: {
      update: dbUpdate,
      toCollection: () => ({ modify: dbModify })
    }
  }
}))

/** 测试环境没有 AudioContext：给一个只记状态的最小假实现（playNote/playChirp 会用到的方法） */
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
import { alarmSounds } from '../services/alarmSounds'
import type { HubAlarm } from '../types'

const alarm = (over: Partial<HubAlarm> = {}): HubAlarm => ({
  id: 1,
  h: 8,
  m: 0,
  s: 0,
  enabled: true,
  triggered: false,
  label: '测试',
  sound: 'default',
  ...over
})

/** 铃声引擎在响与否（声音层面的真相） */
const soundOn = () => alarmSounds.isRinging()

beforeAll(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext)
  // 调度器是模块级单例，定时器只建一次：整个文件统一用假时钟，避免测试间定时器丢失
  vi.useFakeTimers()
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-06T08:00:00'))
  dbUpdate.mockClear()
  dbModify.mockClear()
  // 清空调度器与声音引擎的跨用例残留状态（含 lastCheckDate / lastTickAt / 已触发 key 集合）
  alarmScheduler.resetForTest()
  alarmScheduler.stopRinging()
  alarmSounds.stop()
})

describe('闹钟响铃与关闭（全局调度器）', () => {
  it('到点响铃，点一次「关闭闹钟」→ 横幅消失且铃声停止，90 秒窗口内不复响', () => {
    alarmScheduler.setAlarms([alarm()])
    vi.advanceTimersByTime(1000) // tick：08:00:00 到点
    expect(alarmScheduler.getRinging()).not.toBeNull()
    expect(soundOn()).toBe(true)

    alarmScheduler.stopRinging() // 用户点击「关闭闹钟」
    expect(alarmScheduler.getRinging()).toBeNull()
    expect(soundOn()).toBe(false)

    // 页面数据不回流（无 setAlarms 再调用）也绝不重新入队响铃
    vi.advanceTimersByTime(89_000)
    expect(alarmScheduler.getRinging()).toBeNull()
    expect(soundOn()).toBe(false)
  })

  it('同一时刻多个闹钟排队：点一次关闭 → 整批安静（而不是换下一个接着响）', () => {
    alarmScheduler.setAlarms([alarm({ id: 1, label: 'A' }), alarm({ id: 2, label: 'B' }), alarm({ id: 3, label: 'C' })])
    vi.advanceTimersByTime(1000)
    expect(alarmScheduler.getRinging()).not.toBeNull()
    expect(soundOn()).toBe(true)

    alarmScheduler.stopRinging()
    expect(alarmScheduler.getRinging()).toBeNull()
    expect(soundOn()).toBe(false)
    vi.advanceTimersByTime(2000)
    expect(alarmScheduler.getRinging()).toBeNull()
  })

  it('触发标记即时合并进内存：liveQuery 永不回流时同一闹钟也只响一次', () => {
    const stale = [alarm()] // lastTriggerKey 始终 undefined 的旧数据
    alarmScheduler.setAlarms(stale)

    // 第一次到点：响
    vi.advanceTimersByTime(1000)
    expect(alarmScheduler.getRinging()).not.toBeNull()
    alarmScheduler.stopRinging()

    // 90 秒补触发窗口内逐秒推进：不得再次响铃
    vi.advanceTimersByTime(90_000)
    expect(alarmScheduler.getRinging()).toBeNull()
    expect(soundOn()).toBe(false)
  })

  it('未响铃时重复点关闭也安全（幂等）', () => {
    alarmScheduler.setAlarms([])
    alarmScheduler.stopRinging()
    alarmScheduler.stopRinging()
    expect(alarmScheduler.getRinging()).toBeNull()
    expect(soundOn()).toBe(false)
  })

  it('liveQuery 回流旧快照（触发标记被清）→ 90 秒窗口内不重复入队', () => {
    alarmScheduler.setAlarms([alarm()])
    vi.advanceTimersByTime(1000) // 08:00:00 响铃
    expect(alarmScheduler.getRinging()).not.toBeNull()
    alarmScheduler.stopRinging()

    // 页面回流了旧快照：lastTriggerKey 又变回 undefined（模拟 Dexie 两次写入间的旧发射）
    alarmScheduler.setAlarms([alarm()])
    vi.advanceTimersByTime(90_000)
    expect(alarmScheduler.getRinging()).toBeNull()
    expect(soundOn()).toBe(false)
  })

  it('系统睡眠跨过闹钟点：唤醒后第一条 tick 补响（gap 扩大触发窗口）', () => {
    alarmScheduler.setAlarms([alarm({ h: 8, m: 5 })])
    // 正常走到 08:00:10（未到点）
    vi.advanceTimersByTime(10_000)
    expect(alarmScheduler.getRinging()).toBeNull()

    // 系统睡眠 30 分钟：墙钟直接跳到 08:30:10（定时器暂停，无 tick）
    vi.setSystemTime(new Date('2026-09-06T08:30:10'))
    vi.advanceTimersByTime(1000) // 唤醒后第一条 tick
    expect(alarmScheduler.getRinging()).not.toBeNull()
    expect(soundOn()).toBe(true)
    alarmScheduler.stopRinging()

    // 补响过的闹钟不再重复响
    vi.advanceTimersByTime(5000)
    expect(alarmScheduler.getRinging()).toBeNull()
  })

  it('试听铃声进行中闹钟到点：真闹钟打断试听，铃声必须是真闹钟的（不静音）', () => {
    alarmScheduler.setAlarms([alarm({ h: 8, m: 0 })])
    // 用户此刻在铃声选择器里试听（preview 内部 1.5 秒后自动停）
    alarmSounds.preview('nokia')
    expect(soundOn()).toBe(true)

    // 1 秒后闹钟到点 tick
    vi.advanceTimersByTime(1000)
    expect(alarmScheduler.getRinging()).not.toBeNull()
    expect(soundOn()).toBe(true)

    // 试听的原定 1.5 秒自动停止不得把真闹钟的铃声掐掉
    vi.advanceTimersByTime(1000)
    expect(alarmScheduler.getRinging()).not.toBeNull()
    expect(soundOn()).toBe(true)
    alarmScheduler.stopRinging()
    expect(soundOn()).toBe(false)
  })
})
