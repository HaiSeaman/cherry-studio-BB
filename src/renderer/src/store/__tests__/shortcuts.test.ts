import { DEFAULT_SHORTCUTS } from '@shared/config/constant'
import { beforeAll, describe, expect, it } from 'vitest'

import shortcutsReducer, { initialState, mergeDefaults, mergeDefaultShortcuts } from '../shortcuts'

beforeAll(() => {
  // reducers call window.api.shortcuts.update; provide a no-op stub in tests
  Object.defineProperty(window, 'api', {
    value: { shortcuts: { update: () => Promise.resolve() } },
    configurable: true
  })
})

describe('shortcuts store', () => {
  it('DEFAULT_SHORTCUTS contains the screenshot shortcut, enabled by default', () => {
    const screenshot = DEFAULT_SHORTCUTS.find((s) => s.key === 'screenshot')
    expect(screenshot).toBeDefined()
    expect(screenshot?.enabled).toBe(true)
    expect(screenshot?.shortcut).toEqual(['Alt', 'Shift', 'A'])
    expect(screenshot?.system).toBe(true)
  })

  it('initialState uses the shared DEFAULT_SHORTCUTS list', () => {
    expect(initialState.shortcuts).toEqual(DEFAULT_SHORTCUTS)
    expect(initialState.shortcuts.some((s) => s.key === 'screenshot')).toBe(true)
  })

  it('mergeDefaultShortcuts adds missing defaults (e.g. screenshot) into an old persisted list', () => {
    const oldPersistedList = DEFAULT_SHORTCUTS.filter((s) => s.key !== 'screenshot')
    const merged = mergeDefaultShortcuts(oldPersistedList)

    expect(merged.some((s) => s.key === 'screenshot')).toBe(true)
    const screenshot = merged.find((s) => s.key === 'screenshot')
    expect(screenshot?.enabled).toBe(true)
    expect(merged.length).toBe(DEFAULT_SHORTCUTS.length)
  })

  it('mergeDefaultShortcuts is idempotent', () => {
    const oldPersistedList = DEFAULT_SHORTCUTS.filter((s) => s.key !== 'screenshot')
    const once = mergeDefaultShortcuts(oldPersistedList)
    const twice = mergeDefaultShortcuts(once)
    expect(twice.length).toBe(DEFAULT_SHORTCUTS.length)
  })

  it('mergeDefaultShortcuts keeps user customizations of existing items', () => {
    const customized = DEFAULT_SHORTCUTS.map((s) =>
      s.key === 'screenshot' ? { ...s, shortcut: ['Ctrl', 'Alt', 'S'], enabled: false } : s
    )
    const merged = mergeDefaultShortcuts(customized)

    const screenshot = merged.find((s) => s.key === 'screenshot')
    expect(screenshot?.shortcut).toEqual(['Ctrl', 'Alt', 'S'])
    expect(screenshot?.enabled).toBe(false)
  })

  it('simulates redux-persist rehydrate: old persisted list survives stateReconciler and keeps screenshot', () => {
    // 1. persisted storage holds an OLD list (no screenshot)
    const oldPersistedList = DEFAULT_SHORTCUTS.filter((s) => s.key !== 'screenshot')
    const inboundState = { shortcuts: { shortcuts: oldPersistedList }, _persist: { version: 0, rehydrated: true } }

    // 2. baseReducer runs with initialState (has screenshot) - our merge would run here
    const reducedState = { shortcuts: { shortcuts: DEFAULT_SHORTCUTS } }

    // 3. redux-persist default stateReconciler = autoMergeLevel1: persisted data WINS over reduced
    const reconciled: Record<string, unknown> = { ...reducedState }
    Object.keys(inboundState).forEach((key) => {
      if (key !== '_persist') reconciled[key] = inboundState[key]
    })

    // 4. our custom stateReconciler then re-applies missing defaults
    const shortcutsState = reconciled.shortcuts as { shortcuts: unknown }
    if (Array.isArray(shortcutsState.shortcuts)) {
      reconciled.shortcuts = { ...shortcutsState, shortcuts: mergeDefaultShortcuts(shortcutsState.shortcuts) }
    }

    const finalShortcuts = (reconciled.shortcuts as { shortcuts: typeof DEFAULT_SHORTCUTS }).shortcuts
    expect(finalShortcuts.some((s) => s.key === 'screenshot')).toBe(true)
    expect(finalShortcuts.length).toBe(DEFAULT_SHORTCUTS.length)
  })

  it('mergeDefaults action (dispatched after rehydration) restores the screenshot shortcut', () => {
    // what redux-persist leaves behind after rehydrating an old persisted list
    const oldPersistedList = DEFAULT_SHORTCUTS.filter((s) => s.key !== 'screenshot')
    const state = shortcutsReducer({ shortcuts: oldPersistedList }, mergeDefaults())

    expect(state.shortcuts.some((s) => s.key === 'screenshot')).toBe(true)
    expect(state.shortcuts.length).toBe(DEFAULT_SHORTCUTS.length)
  })

  it('updateShortcut replaces the matching item and keeps others', () => {
    const state = shortcutsReducer(initialState, {
      type: 'shortcuts/updateShortcut',
      payload: { key: 'screenshot', shortcut: ['Ctrl', 'Alt', 'S'], editable: true, enabled: true, system: true }
    })
    const screenshot = state.shortcuts.find((s) => s.key === 'screenshot')
    expect(screenshot?.shortcut).toEqual(['Ctrl', 'Alt', 'S'])
    expect(state.shortcuts.length).toBe(DEFAULT_SHORTCUTS.length)
  })

  it('mergeDefaultShortcuts deduplicates keys duplicated by legacy migrations (keeps first occurrence)', () => {
    // legacy migrations (migrate 48/49/54/57/58/215) pushed shortcut entries with
    // push() without checking whether the key already existed -> duplicated keys
    // in persisted state. The merge must collapse them back to one entry each.
    const duplicated = [
      ...DEFAULT_SHORTCUTS,
      { key: 'toggle_show_assistants', shortcut: ['Ctrl', '['], editable: true, enabled: true, system: false },
      { key: 'toggle_show_topics', shortcut: ['Ctrl', ']'], editable: true, enabled: true, system: false },
      { key: 'copy_last_message', shortcut: ['Ctrl', 'Shift', 'C'], editable: true, enabled: false, system: false },
      { key: 'search_message', shortcut: ['Ctrl', 'F'], editable: true, enabled: true, system: false },
      { key: 'clear_topic', shortcut: ['Ctrl', 'L'], editable: true, enabled: true, system: false },
      { key: 'toggle_new_context', shortcut: ['Ctrl', 'R'], editable: true, enabled: true, system: false },
      { key: 'mini_window', shortcut: ['Alt', 'W'], editable: true, enabled: true, system: true },
      { key: 'exit_fullscreen', shortcut: ['Escape'], editable: false, enabled: true, system: true }
    ]

    const merged = mergeDefaultShortcuts(duplicated)

    const counts = new Map<string, number>()
    for (const s of merged) {
      counts.set(s.key, (counts.get(s.key) ?? 0) + 1)
    }
    expect([...counts.values()].every((c) => c === 1)).toBe(true)
    expect(merged.length).toBe(DEFAULT_SHORTCUTS.length)
    // the FIRST occurrence (the app default) wins, not the legacy migration artifact
    expect(merged.find((s) => s.key === 'toggle_show_assistants')?.shortcut).toEqual(['CommandOrControl', '['])
    expect(merged.find((s) => s.key === 'search_message')?.shortcut).toEqual(['CommandOrControl', 'Shift', 'F'])
  })

  it('mergeDefaultShortcuts heals system/editable metadata corrupted by legacy migrations', () => {
    // migrate 48 rewrote system=true for every shortcut except new_topic; system
    // and editable are NOT user-editable, so they can safely be normalized to
    // the current defaults while shortcut/enabled customizations are preserved
    const corrupted = DEFAULT_SHORTCUTS.map((s) => (s.key === 'new_topic' ? s : { ...s, system: true }))

    const merged = mergeDefaultShortcuts(corrupted)

    expect(merged.find((s) => s.key === 'toggle_show_assistants')?.system).toBe(false)
    expect(merged.find((s) => s.key === 'search_message')?.system).toBe(false)
    expect(merged.find((s) => s.key === 'new_topic')?.system).toBe(false)
    expect(merged.find((s) => s.key === 'screenshot')?.system).toBe(true)
    expect(merged.find((s) => s.key === 'mini_window')?.system).toBe(true)
  })

  it('mergeDefaults action heals a persisted list that already contains duplicates', () => {
    const duplicated = [...DEFAULT_SHORTCUTS, { ...DEFAULT_SHORTCUTS[0] }] // zoom_in duplicated

    const state = shortcutsReducer({ shortcuts: duplicated }, mergeDefaults())

    expect(state.shortcuts.length).toBe(DEFAULT_SHORTCUTS.length)
    expect(state.shortcuts.filter((s) => s.key === 'zoom_in').length).toBe(1)
  })

  it('mergeDefaults heals even when duplicates and missing defaults cancel out in count', () => {
    // 8 keys are missing (to be appended) while 8 OTHER keys are duplicated (to be
    // removed) -> input length === merged length. The merge must still detect the
    // difference by content and heal the list instead of skipping it.
    const missing = DEFAULT_SHORTCUTS.slice(0, 8) // 8 defaults absent from the list
    const base = DEFAULT_SHORTCUTS.filter((s) => !missing.some((m) => m.key === s.key)) // 13 unique
    const duplicated = [...base, ...DEFAULT_SHORTCUTS.slice(8, 16).map((s) => ({ ...s, shortcut: ['Ctrl', 'X'] }))]
    expect(duplicated.length).toBe(DEFAULT_SHORTCUTS.length) // 21 === 21, length check alone would skip

    const state = shortcutsReducer({ shortcuts: duplicated }, mergeDefaults())

    expect(state.shortcuts.length).toBe(DEFAULT_SHORTCUTS.length)
    const counts = new Map<string, number>()
    for (const s of state.shortcuts) counts.set(s.key, (counts.get(s.key) ?? 0) + 1)
    expect([...counts.values()].every((c) => c === 1)).toBe(true)
    expect(state.shortcuts.some((s) => s.shortcut[0] === 'Ctrl')).toBe(false)
  })

  it('mergeDefaultShortcuts does not mutate the input list', () => {
    const input = [...DEFAULT_SHORTCUTS]
    const snapshot = JSON.stringify(input)

    mergeDefaultShortcuts(input)

    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
