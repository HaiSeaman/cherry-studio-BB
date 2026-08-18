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
import type { Shortcut } from '@renderer/types'
import { DEFAULT_SHORTCUTS } from '@shared/config/constant'

export interface ShortcutsState {
  shortcuts: Shortcut[]
}

const initialState: ShortcutsState = {
  shortcuts: DEFAULT_SHORTCUTS
}

/**
 * Merge missing default shortcuts (e.g. the newly added "screenshot") into a
 * stored list, keeping any user customizations of existing items.
 * Used by the persist stateReconciler so new defaults survive rehydration
 * even when an old persisted list would otherwise overwrite initialState.
 */
export const mergeDefaultShortcuts = (shortcuts: Shortcut[]): Shortcut[] => {
  const merged = [...shortcuts]
  for (const def of DEFAULT_SHORTCUTS) {
    if (!merged.some((s) => s.key === def.key)) {
      merged.push(def)
    }
  }
  return merged
}

const getSerializableShortcuts = (shortcuts: Shortcut[]) => {
  return shortcuts.map((shortcut) => ({
    key: shortcut.key,
    shortcut: [...shortcut.shortcut],
    enabled: shortcut.enabled,
    system: shortcut.system,
    editable: shortcut.editable
  }))
}

const shortcutsSlice = createSlice({
  name: 'shortcuts',
  initialState,
  reducers: {
    updateShortcut: (state, action: PayloadAction<Shortcut>) => {
      state.shortcuts = state.shortcuts.map((s) => (s.key === action.payload.key ? action.payload : s))
      void window.api.shortcuts.update(getSerializableShortcuts(state.shortcuts))
    },
    toggleShortcut: (state, action: PayloadAction<string>) => {
      state.shortcuts = state.shortcuts.map((s) => (s.key === action.payload ? { ...s, enabled: !s.enabled } : s))
      void window.api.shortcuts.update(getSerializableShortcuts(state.shortcuts))
    },
    resetShortcuts: (state) => {
      state.shortcuts = initialState.shortcuts
      void window.api.shortcuts.update(getSerializableShortcuts(state.shortcuts))
    },
    /**
     * Dispatched right after redux-persist rehydration (see store/index.ts).
     * Rehydration overwrites initialState with the old persisted list, which would
     * hide newly added defaults like "screenshot". Merge them back in.
     */
    mergeDefaults: (state) => {
      const merged = mergeDefaultShortcuts(state.shortcuts)
      if (merged.length !== state.shortcuts.length) {
        state.shortcuts = merged
        void window.api.shortcuts.update(getSerializableShortcuts(state.shortcuts))
      }
    }
  }
})

export const { updateShortcut, toggleShortcut, resetShortcuts, mergeDefaults } = shortcutsSlice.actions
export default shortcutsSlice.reducer
export { initialState }
