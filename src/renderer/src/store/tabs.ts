import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'

export interface Tab {
  id: string
  path: string
}

export interface TabsState {
  tabs: Tab[]
  activeTabId: string
}

const initialState: TabsState = {
  tabs: [
    {
      id: 'home',
      path: '/'
    }
  ],
  activeTabId: 'home'
}

const tabsSlice = createSlice({
  name: 'tabs',
  initialState,
  reducers: {
    removeTab: (state, action: PayloadAction<string>) => {
      const index = state.tabs.findIndex((tab) => tab.id === action.payload)
      if (index !== -1) {
        state.tabs.splice(index, 1)
        // 如果关闭的是当前标签页，则切换到最后一个标签页
        if (action.payload === state.activeTabId) {
          state.activeTabId = state.tabs[state.tabs.length - 1].id
        }
      }
    },
    updateTab: (state, action: PayloadAction<{ id: string; updates: Partial<Tab> }>) => {
      const tab = state.tabs.find((tab) => tab.id === action.payload.id)
      if (tab) {
        Object.assign(tab, action.payload.updates)
      }
    },
    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTabId = action.payload
    }
  }
})

export const { removeTab, setActiveTab, updateTab } = tabsSlice.actions
export default tabsSlice.reducer
