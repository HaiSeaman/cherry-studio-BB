import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/** IPTV 页持久化偏好（Redux persist，不进 blacklist，不在 storeSyncService 同步列表 → 纯本地） */
export type IptvSettingsState = {
  volume: number // 0-200，>100 由播放器走 Web Audio 增益
  lastVolumeBeforeMute: number
  autoPlay: boolean
  autoReconnect: boolean
}

const initialState: IptvSettingsState = {
  volume: 80,
  lastVolumeBeforeMute: 80,
  autoPlay: true,
  autoReconnect: true
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
    }
  }
})

export const { setVolume, setLastVolumeBeforeMute, setAutoPlay, setAutoReconnect } = iptvSettingsSlice.actions

export default iptvSettingsSlice.reducer
