import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

export interface TranslateState {
  settings: {
    autoCopy: boolean
  }
}

const initialState: TranslateState = {
  settings: {
    autoCopy: false
  }
}

const translateSlice = createSlice({
  name: 'translate',
  initialState,
  reducers: {
    updateSettings: (state, action: PayloadAction<Partial<TranslateState['settings']>>) => {
      const update = action.payload
      Object.assign(state.settings, update)
    }
  }
})

export const { updateSettings } = translateSlice.actions

export default translateSlice.reducer
