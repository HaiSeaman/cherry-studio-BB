import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/** 闹钟便签页持久化偏好 */
export type HubSettingsState = {
  alarmVolume: number // 0-300（>100 经 GainNode 增益放大）
  defaultSound: string
}

const initialState: HubSettingsState = {
  alarmVolume: 100,
  defaultSound: 'default'
}

const hubSettingsSlice = createSlice({
  name: 'hubSettings',
  initialState,
  reducers: {
    setAlarmVolume(state, action: PayloadAction<number>) {
      state.alarmVolume = Math.min(Math.max(action.payload, 0), 300)
    },
    setDefaultSound(state, action: PayloadAction<string>) {
      state.defaultSound = action.payload
    }
  }
})

export const { setAlarmVolume, setDefaultSound } = hubSettingsSlice.actions

export default hubSettingsSlice.reducer
