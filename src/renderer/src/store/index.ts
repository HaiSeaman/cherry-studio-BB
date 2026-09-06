import { loggerService } from '@logger'
import { combineReducers, configureStore } from '@reduxjs/toolkit'
import { IpcChannel } from '@shared/IpcChannel'
import { useDispatch, useSelector, useStore } from 'react-redux'
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist'
import storage from 'redux-persist/lib/storage'

import iptvSettings, { mergeDefaults as mergeIptvDefaults } from '../pages/iptv/store/iptvSettingsSlice'
import musicSettings from '../pages/music/store/musicSettingsSlice'
import hubSettings from '../pages/notes/store/hubSettingsSlice'
import paint from '../pages/paint/store/paintSlice'
import storeSyncService from '../services/StoreSyncService'
import assistants from './assistants'
import backup from './backup'
import inputToolsReducer from './inputTools'
import llm from './llm'
import mcp from './mcp'
import messageBlocksReducer from './messageBlock'
import minapps from './minapps'
import newMessagesReducer from './newMessage'
import runtime from './runtime'
import selectionStore from './selectionStore'
import settings from './settings'
import shortcuts, { mergeDefaults } from './shortcuts'
import tabs from './tabs'
import toolPermissions from './toolPermissions'
import translate from './translate'
import websearch from './websearch'

const logger = loggerService.withContext('Store')

const rootReducer = combineReducers({
  assistants,
  backup,
  llm,
  settings,
  runtime,
  shortcuts,
  minapps,
  websearch,
  mcp,
  selectionStore,
  tabs,
  messages: newMessagesReducer,
  messageBlocks: messageBlocksReducer,
  inputTools: inputToolsReducer,
  paint,
  musicSettings,
  hubSettings,
  iptvSettings,
  translate,
  toolPermissions
})

// ponytail: version 基线重置为 0。旧版持久化数据为当前 reducer 同构格式，
// redux-persist 无 migrate 时原样放行，数据零丢失；历史 216 个迁移函数已整体移除。
// v1: 侧边栏新增「自动化」图标（后被 v4 反转：自动化并入助手工作台）
// v2: 「音乐」并入闹钟便签中控台（/music 下线）
// v3: 「图片生成」并入助手工作台（/paint 下线）
// v4: 「自动化」并入助手工作台（/automation 下线），侧边栏入口收敛为 3+设置。
//     migrate 累积原则：对任何旧版本只调用本函数一次，须覆盖全部历史净效果——
//     三个已删入口直接从持久化列表过滤即可，天然覆盖 v0~v3 所有老用户。
//     实现见 migrate.ts（纯函数，单测覆盖各历史版本升级路径）。
import { migrate } from './migrate'

const persistedReducer = persistReducer(
  {
    key: 'cherry-studio',
    storage,
    version: 4,
    migrate,
    blacklist: ['runtime', 'messages', 'messageBlocks', 'tabs', 'toolPermissions', 'paint']
  },
  rootReducer
)

/**
 * Configures the store sync service to synchronize specific state slices across all windows.
 * For detailed implementation, see @renderer/services/StoreSyncService.ts
 *
 * Usage:
 * - 'xxxx/' - Synchronizes the entire state slice
 * - 'xxxx/sliceName' - Synchronizes a specific slice within the state
 *
 * To listen for store changes in a window:
 * Call storeSyncService.subscribe() in the window's entryPoint.tsx
 */
storeSyncService.setOptions({
  syncList: ['assistants/', 'settings/', 'llm/', 'selectionStore/']
})

const store = configureStore({
  // @ts-ignore store type is unknown
  reducer: persistedReducer as typeof rootReducer,
  middleware: (getDefaultMiddleware) => {
    return getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER]
      }
    }).concat(storeSyncService.createMiddleware())
  },
  devTools: true
})

export type RootState = ReturnType<typeof rootReducer>
export type AppDispatch = typeof store.dispatch

export const persistor = persistStore(store, undefined, () => {
  // redux-persist rehydrates with the OLD persisted shortcuts list, overwriting
  // initialState and hiding newly added defaults like "screenshot". Dispatch a
  // merge right after rehydration so new shortcuts appear in the settings UI.
  store.dispatch(mergeDefaults())
  // 同理：老存档没有 iptvSettings 新增字段（如 localPlayMode），补回默认值防止读成 undefined
  store.dispatch(mergeIptvDefaults())

  // Notify main process that Redux store is ready
  void window.electron?.ipcRenderer?.invoke(IpcChannel.ReduxStoreReady)
  logger.info('Redux store ready, notified main process')
})

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
export const useAppStore = useStore.withTypes<typeof store>()
window.store = store

export async function handleSaveData() {
  logger.info('Flushing redux persistor data')
  await persistor.flush()
  logger.info('Flushed redux persistor data')
}

export default store
