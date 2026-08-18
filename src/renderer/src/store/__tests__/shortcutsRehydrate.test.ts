import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { DEFAULT_SHORTCUTS } from '@shared/config/constant'
import { persistReducer, persistStore } from 'redux-persist'
import { beforeAll, describe, expect, it } from 'vitest'

import shortcutsReducer, { mergeDefaults } from '../shortcuts'

// redux-persist reads/writes storage under a "persist:" prefixed key by default
const storageKey = (key: string) => `persist:${key}`

const createMemoryStorage = () => {
  const store: Record<string, string> = {}
  return {
    getItem: async (key: string) => store[key] ?? null,
    setItem: async (key: string, value: string) => {
      store[key] = value
    },
    removeItem: async (key: string) => {
      delete store[key]
    }
  }
}

const waitForRehydrate = (store: { getState: () => unknown }): Promise<void> =>
  new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const state = store.getState() as { _persist?: { rehydrated?: boolean } }
      if (state._persist?.rehydrated) {
        clearInterval(timer)
        resolve()
      }
    }, 10)
    setTimeout(() => {
      clearInterval(timer)
      resolve()
    }, 3000)
  })

beforeAll(() => {
  Object.defineProperty(window, 'api', {
    value: { shortcuts: { update: () => Promise.resolve() } },
    configurable: true
  })
})

describe('shortcuts rehydration (integration)', () => {
  it('old persisted list without "screenshot" ends up with it after rehydrate + mergeDefaults', async () => {
    const storage = createMemoryStorage()
    const key = 'cherry-test'
    const oldList = DEFAULT_SHORTCUTS.filter((s) => s.key !== 'screenshot')

    // seed storage the way redux-persist would have written it on an old version
    // redux-persist v6 stores each slice value double-serialized:
    // { shortcuts: JSON.stringify({ shortcuts: oldList }) }
    await storage.setItem(storageKey(key), JSON.stringify({ shortcuts: JSON.stringify({ shortcuts: oldList }) }))

    const rootReducer = combineReducers({ shortcuts: shortcutsReducer })
    const persistedReducer = persistReducer({ key, storage, version: 0 }, rootReducer)
    const store = configureStore({ reducer: persistedReducer })

    const persistor = persistStore(store, undefined, () => {
      // mirrors store/index.ts: dispatch mergeDefaults right after rehydration
      store.dispatch(mergeDefaults())
    })

    await waitForRehydrate(store)

    const state = store.getState() as { shortcuts: { shortcuts: typeof DEFAULT_SHORTCUTS } }
    // without the merge, the old persisted list would have won; the merge brings
    // the default back so the settings UI shows "screenshot"
    expect(state.shortcuts.shortcuts.some((s) => s.key === 'screenshot')).toBe(true)
    expect(state.shortcuts.shortcuts.length).toBe(DEFAULT_SHORTCUTS.length)

    persistor.pause()
  })

  it('without the mergeDefaults dispatch, the screenshot shortcut stays hidden (regression guard)', async () => {
    const storage = createMemoryStorage()
    const key = 'cherry-test-no-merge'
    const oldList = DEFAULT_SHORTCUTS.filter((s) => s.key !== 'screenshot')
    // redux-persist v6 stores each slice value double-serialized:
    // { shortcuts: JSON.stringify({ shortcuts: oldList }) }
    await storage.setItem(storageKey(key), JSON.stringify({ shortcuts: JSON.stringify({ shortcuts: oldList }) }))

    const rootReducer = combineReducers({ shortcuts: shortcutsReducer })
    const persistedReducer = persistReducer({ key, storage, version: 0 }, rootReducer)
    const store = configureStore({ reducer: persistedReducer })

    const persistor = persistStore(store) // no mergeDefaults dispatch

    await waitForRehydrate(store)

    const state = store.getState() as { shortcuts: { shortcuts: typeof DEFAULT_SHORTCUTS } }
    expect(state.shortcuts.shortcuts.some((s) => s.key === 'screenshot')).toBe(false)

    persistor.pause()
  })
})
