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
})
