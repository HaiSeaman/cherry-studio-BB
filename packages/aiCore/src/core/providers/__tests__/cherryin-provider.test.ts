import { describe, expect, it } from 'vitest'

import { createCherryIn } from '../cherryin/cherryin-provider'

describe('cherryin provider', () => {
  it('should generate unique ids instead of timestamp-based ids', () => {
    const provider = createCherryIn({ apiKey: 'test-key' })
    // Gemini 模型需要 generateId 来生成 toolCallId 与 grounding source id
    const geminiModel = provider.languageModel('google/gemini-2.0-flash') as unknown as {
      generateId: () => string
    }

    expect(typeof geminiModel.generateId).toBe('function')

    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(geminiModel.generateId())
    }

    // 同一毫秒内的连续调用也必须产生唯一 ID（旧实现会用 Date.now() 重复）
    expect(ids.size).toBe(100)
    expect([...ids].every((id) => !/^cherryin-\d+$/.test(id))).toBe(true)
  })
})