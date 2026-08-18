import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { RADIO_DEFAULT_API } from '../services/radioApi'
import type { PlayMode, RadioStation } from '../types'

/**
 * 音乐页持久化偏好（Redux persist，不进 blacklist）：
 * 音量/静音记忆、播放模式、收藏夹模式、FM 配置与自定义电台
 */

export type MusicSettingsState = {
  volume: number
  lastVolumeBeforeMute: number
  playMode: PlayMode
  favoritesActive: boolean
  radioConfig: { apiBaseUrl: string; timeout: number }
  customStations: RadioStation[]
}

const initialState: MusicSettingsState = {
  volume: 80,
  lastVolumeBeforeMute: 80,
  playMode: 'sequential',
  favoritesActive: false,
  radioConfig: { apiBaseUrl: RADIO_DEFAULT_API, timeout: 10000 },
  customStations: []
}

const musicSettingsSlice = createSlice({
  name: 'musicSettings',
  initialState,
  reducers: {
    setVolume(state, action: PayloadAction<number>) {
      state.volume = Math.min(Math.max(action.payload, 0), 100)
    },
    setLastVolumeBeforeMute(state, action: PayloadAction<number>) {
      state.lastVolumeBeforeMute = Math.min(Math.max(action.payload, 0), 100)
    },
    setPlayMode(state, action: PayloadAction<PlayMode>) {
      state.playMode = action.payload
    },
    setFavoritesActive(state, action: PayloadAction<boolean>) {
      state.favoritesActive = action.payload
    },
    addCustomStation(state, action: PayloadAction<RadioStation>) {
      if (state.customStations.length >= 500) return
      if (!state.customStations.some((s) => s.url === action.payload.url)) {
        state.customStations.push(action.payload)
      }
    },
    removeCustomStation(state, action: PayloadAction<string>) {
      state.customStations = state.customStations.filter((s) => s.url !== action.payload)
    }
  }
})

export const {
  setVolume,
  setLastVolumeBeforeMute,
  setPlayMode,
  setFavoritesActive,
  addCustomStation,
  removeCustomStation
} = musicSettingsSlice.actions

export default musicSettingsSlice.reducer
