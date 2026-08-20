import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Model } from '@renderer/types'

/** 上一次生成参数（用于重新生成 / 编辑后重生成） */
export type PaintLastGeneration = {
  modelId: string
  prompt: string
  imageSize: string
  aspectRatio?: string
  personGeneration?: string
  batchSize: number
  inputImages?: string[]
}

export interface PaintState {
  /** 是否正在生成图片 */
  isGenerating: boolean
  /** 当前选择的绘画模型（不持久化） */
  selectedModel: Model | null
  /** 上一次成功生成的参数（不持久化） */
  lastGeneration: PaintLastGeneration | null
}

const initialState: PaintState = {
  isGenerating: false,
  selectedModel: null,
  lastGeneration: null
}

const paintSlice = createSlice({
  name: 'paint',
  initialState,
  reducers: {
    setIsGenerating: (state, action: PayloadAction<boolean>) => {
      state.isGenerating = action.payload
    },
    setSelectedModel: (state, action: PayloadAction<Model | null>) => {
      state.selectedModel = action.payload
    },
    setLastGeneration: (state, action: PayloadAction<PaintLastGeneration | null>) => {
      state.lastGeneration = action.payload
    }
  }
})

export const { setIsGenerating, setSelectedModel, setLastGeneration } = paintSlice.actions
export default paintSlice.reducer
