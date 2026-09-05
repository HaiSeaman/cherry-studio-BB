import { describe, expect, it } from 'vitest'

import reducer, {
  type IptvSettingsState,
  mergeDefaults,
  setAutoPlay,
  setAutoReconnect,
  setLastVolumeBeforeMute,
  setListPercent,
  setLocalPlayMode,
  setLocalRate,
  setSidebarPercent,
  setVolume
} from '../../store/iptvSettingsSlice'

const initial: IptvSettingsState = {
  volume: 80,
  lastVolumeBeforeMute: 80,
  autoPlay: true,
  autoReconnect: true,
  sidebarPercent: 10,
  listPercent: 10,
  localPlayMode: 'order',
  localRate: 1
}

describe('iptvSettingsSlice', () => {
  it('默认值', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initial)
  })

  it('setVolume 正常范围', () => {
    expect(reducer(initial, setVolume(50)).volume).toBe(50)
  })

  it('setVolume 边界夹取（<0 → 0，>200 → 200）', () => {
    expect(reducer(initial, setVolume(-10)).volume).toBe(0)
    expect(reducer(initial, setVolume(300)).volume).toBe(200)
  })

  it('setVolume 支持增益区间（100-200 原样保留）', () => {
    expect(reducer(initial, setVolume(150)).volume).toBe(150)
    expect(reducer(initial, setVolume(200)).volume).toBe(200)
  })

  it('setLastVolumeBeforeMute 边界夹取（0-200）', () => {
    expect(reducer(initial, setLastVolumeBeforeMute(300)).lastVolumeBeforeMute).toBe(200)
  })

  it('setAutoPlay / setAutoReconnect 开关', () => {
    expect(reducer(initial, setAutoPlay(false)).autoPlay).toBe(false)
    expect(reducer(initial, setAutoReconnect(false)).autoReconnect).toBe(false)
  })

  it('setSidebarPercent 正常范围与边界夹取（6-30）', () => {
    expect(reducer(initial, setSidebarPercent(12)).sidebarPercent).toBe(12)
    expect(reducer(initial, setSidebarPercent(2)).sidebarPercent).toBe(6)
    expect(reducer(initial, setSidebarPercent(50)).sidebarPercent).toBe(30)
  })

  it('setListPercent 正常范围与边界夹取（6-30）', () => {
    expect(reducer(initial, setListPercent(15)).listPercent).toBe(15)
    expect(reducer(initial, setListPercent(2)).listPercent).toBe(6)
    expect(reducer(initial, setListPercent(50)).listPercent).toBe(30)
  })

  it('setLocalPlayMode 三模式切换', () => {
    expect(reducer(initial, setLocalPlayMode('loopOne')).localPlayMode).toBe('loopOne')
    expect(reducer(initial, setLocalPlayMode('shuffle')).localPlayMode).toBe('shuffle')
    expect(reducer(initial, setLocalPlayMode('order')).localPlayMode).toBe('order')
  })

  it('setLocalRate 正常范围与边界夹取（0.25-4）', () => {
    expect(reducer(initial, setLocalRate(1.5)).localRate).toBe(1.5)
    expect(reducer(initial, setLocalRate(0.1)).localRate).toBe(0.25)
    expect(reducer(initial, setLocalRate(10)).localRate).toBe(4)
  })

  it('mergeDefaults：老存档（缺新字段）补回默认值，已有值不覆盖', () => {
    // 模拟 redux-persist 装回老存档：整体替换切片，只有旧字段
    const oldPersisted = { volume: 60, autoPlay: false } as unknown as IptvSettingsState
    const healed = reducer(oldPersisted, mergeDefaults())
    expect(healed).toEqual({
      volume: 60, // 已有值保留
      lastVolumeBeforeMute: 80,
      autoPlay: false, // 已有值保留
      autoReconnect: true,
      sidebarPercent: 10,
      listPercent: 10,
      localPlayMode: 'order', // 新字段补回默认
      localRate: 1
    })
  })
})
