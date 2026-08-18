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
import { DEFAULT_SHORTCUTS, mergeDefaultShortcuts } from '@shared/config/constant'

export interface ShortcutsState {
  shortcuts: Shortcut[]
}

const initialState: ShortcutsState = {
  // clone the defaults so the slice never shares (and could mutate) the
  // module-level DEFAULT_SHORTCUTS array/objects
  shortcuts: DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
}

/**
 * Merge a stored shortcut list with the defaults:
 * - deduplicates keys duplicated by legacy migrations (keeps the first occurrence)
 * - heals system/editable metadata corrupted by legacy migrations
 * - appends missing defaults (e.g. the newly added "screenshot")
 * Used by the persist stateReconciler so new defaults survive rehydration
 * even when an old persisted list would otherwise overwrite initialState.
 */
export { mergeDefaultShortcuts }

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
      // clone the defaults so the slice never shares the module-level array
      state.shortcuts = initialState.shortcuts.map((s) => ({ ...s }))
      void window.api.shortcuts.update(getSerializableShortcuts(state.shortcuts))
    },
    /**
     * Dispatched right after redux-persist rehydration (see store/index.ts).
     * Rehydration overwrites initialState with the old persisted list, which would
     * hide newly added defaults like "screenshot". Merge them back in.
     */
    mergeDefaults: (state) => {
      const merged = mergeDefaultShortcuts(state.shortcuts)
      // compare by content, not just length: duplicates and missing defaults can
      // cancel out numerically (e.g. 8 dupes removed + 8 defaults appended), and
      // metadata healing (system/editable) does not change the length at all
      const changed =
        merged.length !== state.shortcuts.length ||
        merged.some((s, i) => JSON.stringify(s) !== JSON.stringify(state.shortcuts[i]))
      if (changed) {
        state.shortcuts = merged
        void window.api.shortcuts.update(getSerializableShortcuts(state.shortcuts))
      }
    }
  }
})

export const { updateShortcut, toggleShortcut, resetShortcuts, mergeDefaults } = shortcutsSlice.actions
export default shortcutsSlice.reducer
export { initialState }
