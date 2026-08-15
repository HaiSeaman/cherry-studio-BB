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
import { AppLogo, UserAvatar } from '@renderer/config/env'
import type { MinAppRegion, MinAppType, Topic, WebSearchStatus } from '@renderer/types'

export interface ChatState {
  isMultiSelectMode: boolean
  selectedMessageIds: string[]
  activeTopic: Topic | null
  /** topic ids that are currently being renamed */
  renamingTopics: string[]
  /** topic ids that are newly renamed */
  newlyRenamedTopics: string[]
}

export interface WebSearchState {
  activeSearches: Record<string, WebSearchStatus>
}

export interface RuntimeState {
  avatar: string
  generating: boolean
  translating: boolean
  translateAbortKey?: string
  /** whether the minapp popup is shown */
  minappShow: boolean
  /** the minapps that are opened and should be keep alive */
  openedKeepAliveMinapps: MinAppType[]
  /** the minapp that is opened for one time */
  openedOneOffMinapp: MinAppType | null
  /** the current minapp id */
  currentMinappId: string
  searching: boolean
  filesPath: string
  resourcesPath: string
  export: ExportState
  chat: ChatState
  websearch: WebSearchState
  /** Detected region from IP lookup (not persisted, re-detected on each app start) */
  detectedRegion: MinAppRegion | null
  /** Query whether a task is processing or not. undefined and false share same semantics.  */
  loadingMap: Record<string, boolean>
}

export interface ExportState {
  isExporting: boolean
}

const initialState: RuntimeState = {
  avatar: UserAvatar,
  generating: false,
  translating: false,
  minappShow: false,
  openedKeepAliveMinapps: [],
  openedOneOffMinapp: null,
  currentMinappId: '',
  searching: false,
  filesPath: '',
  resourcesPath: '',
  export: {
    isExporting: false
  },
  chat: {
    isMultiSelectMode: false,
    selectedMessageIds: [],
    activeTopic: null,
    renamingTopics: [],
    newlyRenamedTopics: []
  },
  websearch: {
    activeSearches: {}
  },
  detectedRegion: null,
  loadingMap: {}
}

const runtimeSlice = createSlice({
  name: 'runtime',
  initialState,
  reducers: {
    setAvatar: (state, action: PayloadAction<string | null>) => {
      state.avatar = action.payload || AppLogo
    },
    setGenerating: (state, action: PayloadAction<boolean>) => {
      state.generating = action.payload
    },
    setTranslating: (state, action: PayloadAction<boolean>) => {
      state.translating = action.payload
    },
    setTranslateAbortKey: (state, action: PayloadAction<string>) => {
      state.translateAbortKey = action.payload
    },
    setMinappShow: (state, action: PayloadAction<boolean>) => {
      state.minappShow = action.payload
    },
    setOpenedKeepAliveMinapps: (state, action: PayloadAction<MinAppType[]>) => {
      state.openedKeepAliveMinapps = action.payload
    },
    setOpenedOneOffMinapp: (state, action: PayloadAction<MinAppType | null>) => {
      state.openedOneOffMinapp = action.payload
    },
    setCurrentMinappId: (state, action: PayloadAction<string>) => {
      state.currentMinappId = action.payload
    },
    setSearching: (state, action: PayloadAction<boolean>) => {
      state.searching = action.payload
    },
    setFilesPath: (state, action: PayloadAction<string>) => {
      state.filesPath = action.payload
    },
    setResourcesPath: (state, action: PayloadAction<string>) => {
      state.resourcesPath = action.payload
    },
    setExportState: (state, action: PayloadAction<Partial<ExportState>>) => {
      state.export = { ...state.export, ...action.payload }
    },
    // Chat related actions
    toggleMultiSelectMode: (state, action: PayloadAction<boolean>) => {
      state.chat.isMultiSelectMode = action.payload
      if (!action.payload) {
        state.chat.selectedMessageIds = []
      }
    },
    setSelectedMessageIds: (state, action: PayloadAction<string[]>) => {
      state.chat.selectedMessageIds = action.payload
    },
    setActiveTopic: (state, action: PayloadAction<Topic>) => {
      // @ts-ignore ts2589 false positive
      state.chat.activeTopic = action.payload
    },
    setRenamingTopics: (state, action: PayloadAction<string[]>) => {
      state.chat.renamingTopics = action.payload
    },
    setNewlyRenamedTopics: (state, action: PayloadAction<string[]>) => {
      state.chat.newlyRenamedTopics = action.payload
    },
    // WebSearch related actions
    setActiveSearches: (state, action: PayloadAction<Record<string, WebSearchStatus>>) => {
      state.websearch.activeSearches = action.payload
    },
    setWebSearchStatus: (state, action: PayloadAction<{ requestId: string; status: WebSearchStatus }>) => {
      const { requestId, status } = action.payload
      if (status.phase === 'default') {
        // default phase means the search finished: remove the entry instead of
        // deleting then immediately re-adding it (which leaked one entry per search)
        delete state.websearch.activeSearches[requestId]
        return
      }
      state.websearch.activeSearches[requestId] = status
    },
    startLoadingAction: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload
      state.loadingMap[id] = true
    },
    finishLoadingAction: (state, action: PayloadAction<{ id: string }>) => {
      const { id } = action.payload
      delete state.loadingMap[id]
    },
    setDetectedRegion: (state, action: PayloadAction<MinAppRegion | null>) => {
      state.detectedRegion = action.payload
    }
  }
})

export const {
  setAvatar,
  setGenerating,
  setTranslating,
  setTranslateAbortKey,
  setMinappShow,
  setOpenedKeepAliveMinapps,
  setOpenedOneOffMinapp,
  setCurrentMinappId,
  setSearching,
  setFilesPath,
  setResourcesPath,
  setExportState,
  // Chat related actions
  toggleMultiSelectMode,
  setSelectedMessageIds,
  setActiveTopic,
  setRenamingTopics,
  setNewlyRenamedTopics,
  startLoadingAction,
  finishLoadingAction,
  // WebSearch related actions
  setActiveSearches,
  setWebSearchStatus,
  // Region detection
  setDetectedRegion
} = runtimeSlice.actions

export default runtimeSlice.reducer
