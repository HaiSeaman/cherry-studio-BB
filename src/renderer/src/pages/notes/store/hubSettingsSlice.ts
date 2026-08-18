import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/** 自定义闹钟声音（文件路径持久化；播放时经 IPC 读二进制解码缓存） */
export type CustomSound = {
  id: string
  name: string
  filePath: string
}

/** 闹钟便签页持久化偏好 */
export type HubSettingsState = {
  alarmVolume: number // 0-300（>100 经 GainNode 增益放大）
  defaultSound: string
  customSounds: CustomSound[]
}

const initialState: HubSettingsState = {
  alarmVolume: 100,
  defaultSound: 'default',
  customSounds: []
}

const hubSettingsSlice = createSlice({
  name: 'hubSettings',
  initialState,
  reducers: {
    setAlarmVolume(state, action: PayloadAction<number>) {
      state.alarmVolume = Math.min(Math.max(action.payload, 0), 300)
    },
    addCustomSound(state, action: PayloadAction<CustomSound>) {
      if (!state.customSounds.some((s) => s.filePath === action.payload.filePath)) {
        state.customSounds.push(action.payload)
      }
    },
    removeCustomSound(state, action: PayloadAction<string>) {
      state.customSounds = state.customSounds.filter((s) => s.id !== action.payload)
    }
  }
})

export const { setAlarmVolume, addCustomSound, removeCustomSound } = hubSettingsSlice.actions

export default hubSettingsSlice.reducer
