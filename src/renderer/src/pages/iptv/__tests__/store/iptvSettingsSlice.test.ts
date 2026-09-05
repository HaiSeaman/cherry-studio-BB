import { describe, expect, it } from 'vitest'

import reducer, {
  type IptvSettingsState,
  setAutoPlay,
  setAutoReconnect,
  setLastVolumeBeforeMute,
  setVolume
} from '../../store/iptvSettingsSlice'

const initial: IptvSettingsState = {
  volume: 80,
  lastVolumeBeforeMute: 80,
  autoPlay: true,
  autoReconnect: true
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
})
