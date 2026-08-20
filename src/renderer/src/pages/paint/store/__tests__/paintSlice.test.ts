import paintReducer, {
  type PaintState,
  setIsGenerating,
  setLastGeneration,
  setSelectedModel
} from '@renderer/pages/paint/store/paintSlice'
import type { Model } from '@renderer/types'
import { describe, expect, it } from 'vitest'

const createModel = (id: string, name?: string): Model =>
  ({
    id,
    name: name ?? id,
    provider: 'test-provider',
    group: 'default',
    type: ['image']
  }) as unknown as Model

const buildState = (partial: Partial<PaintState> = {}): PaintState => ({
  isGenerating: false,
  selectedModel: null,
  lastGeneration: null,
  ...partial
})

describe('paint slice — setIsGenerating', () => {
  it('toggles generating flag', () => {
    expect(paintReducer(buildState(), setIsGenerating(true)).isGenerating).toBe(true)
    expect(paintReducer(buildState(), setIsGenerating(false)).isGenerating).toBe(false)
  })
})

describe('paint slice — setSelectedModel', () => {
  it('sets selected model', () => {
    const model = createModel('dall-e-3')
    const next = paintReducer(buildState(), setSelectedModel(model))
    expect(next.selectedModel?.id).toBe('dall-e-3')
  })

  it('can clear selected model', () => {
    const state = buildState({ selectedModel: createModel('dall-e-3') })
    const next = paintReducer(state, setSelectedModel(null))
    expect(next.selectedModel).toBeNull()
  })
})

describe('paint slice — setLastGeneration', () => {
  it('records last generation params', () => {
    const next = paintReducer(
      buildState(),
      setLastGeneration({ modelId: 'dall-e-3', prompt: 'a cat', imageSize: '1024x1024', batchSize: 1 })
    )
    expect(next.lastGeneration?.prompt).toBe('a cat')
    expect(next.lastGeneration?.modelId).toBe('dall-e-3')
  })

  it('can clear last generation', () => {
    const state = buildState({
      lastGeneration: { modelId: 'dall-e-3', prompt: 'a cat', imageSize: '1024x1024', batchSize: 1 }
    })
    expect(paintReducer(state, setLastGeneration(null)).lastGeneration).toBeNull()
  })
})
