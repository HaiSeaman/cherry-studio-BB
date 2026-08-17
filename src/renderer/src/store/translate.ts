/**
 * @deprecated Scheduled for removal in v2.0.0
 * --------------------------------------------------------------------------
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING (by 0xfullex)
 * --------------------------------------------------------------------------
 * STOP: Feature PRs affecting this file are currently BLOCKED.
 * Only critical bug fixes are accepted during this migration phase.
 *
 * This file is being refactored to v2 standards.
 * Any non-critical changes will conflict with the ongoing work.
 *
 * 🔗 Context & Status:
 * - Contribution Hold: https://github.com/CherryHQ/cherry-studio/issues/10954
 * - v2 Refactor PR   : https://github.com/CherryHQ/cherry-studio/pull/10162
 * --------------------------------------------------------------------------
 */
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
