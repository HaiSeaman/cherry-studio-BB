import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { clampRate } from '../services/localMediaService'
import type { LocalPlayMode } from '../types'

/** IPTV 页持久化偏好（Redux persist，不进 blacklist，不在 storeSyncService 同步列表 → 纯本地） */
export type IptvSettingsState = {
  volume: number // 0-200，>100 由播放器走 Web Audio 增益
  lastVolumeBeforeMute: number
  autoPlay: boolean
  autoReconnect: boolean
  sidebarPercent: number // 左栏分组列表宽度占比（拖拽手柄可调，%，默认 10 = 1:8:1 布局的"1"）
  listPercent: number // 右栏列表宽度占比（拖拽手柄可调，%，默认 10 = 1:8:1 布局的"1"）
  localPlayMode: LocalPlayMode // 本地视频自动连播策略
  localRate: number // 本地视频倍速（0.25-4，跨会话记住）
}

/** 两侧栏占比共用一个范围：太窄内容挤不下，太宽挤压播放器（中间恒为 100 − 两侧之和） */
const MIN_PANE_PERCENT = 6
const MAX_PANE_PERCENT = 30

export const clampPanePercent = (p: number) => Math.min(Math.max(p, MIN_PANE_PERCENT), MAX_PANE_PERCENT)

const initialState: IptvSettingsState = {
  volume: 80,
  lastVolumeBeforeMute: 80,
  autoPlay: true,
  autoReconnect: true,
  sidebarPercent: 10,
  listPercent: 10,
  localPlayMode: 'order',
  localRate: 1
}

const iptvSettingsSlice = createSlice({
  name: 'iptvSettings',
  initialState,
  reducers: {
    setVolume(state, action: PayloadAction<number>) {
      state.volume = Math.min(Math.max(action.payload, 0), 200)
    },
    setLastVolumeBeforeMute(state, action: PayloadAction<number>) {
      state.lastVolumeBeforeMute = Math.min(Math.max(action.payload, 0), 200)
    },
    setAutoPlay(state, action: PayloadAction<boolean>) {
      state.autoPlay = action.payload
    },
    setAutoReconnect(state, action: PayloadAction<boolean>) {
      state.autoReconnect = action.payload
    },
    setSidebarPercent(state, action: PayloadAction<number>) {
      state.sidebarPercent = clampPanePercent(action.payload)
    },
    setListPercent(state, action: PayloadAction<number>) {
      state.listPercent = clampPanePercent(action.payload)
    },
    setLocalPlayMode(state, action: PayloadAction<LocalPlayMode>) {
      state.localPlayMode = action.payload
    },
    setLocalRate(state, action: PayloadAction<number>) {
      state.localRate = clampRate(action.payload)
    },
    /**
     * 启动时（redux-persist 装回存档后）立刻调用：老存档整体替换本切片时，
     * 新增字段会缺失（undefined），这里按 initialState 补回默认值。
     * 与 shortcuts 的 mergeDefaults 同一套路（见 store/index.ts persistStore 回调）。
     */
    mergeDefaults(state) {
      for (const [key, value] of Object.entries(initialState)) {
        if ((state as Record<string, unknown>)[key] === undefined) {
          ;(state as Record<string, unknown>)[key] = value
        }
      }
    }
  }
})

export const {
  setVolume,
  setLastVolumeBeforeMute,
  setAutoPlay,
  setAutoReconnect,
  setSidebarPercent,
  setListPercent,
  setLocalPlayMode,
  setLocalRate,
  mergeDefaults
} = iptvSettingsSlice.actions

export default iptvSettingsSlice.reducer
