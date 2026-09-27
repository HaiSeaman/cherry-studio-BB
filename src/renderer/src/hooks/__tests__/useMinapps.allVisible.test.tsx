import { configureStore } from '@reduxjs/toolkit'
import minAppsReducer from '@renderer/store/minapps'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

// 两个 Global + 一个 CN-only：过去 CN-only 会在「地区=全球」时被静默隐藏
const { APPS } = vi.hoisted(() => {
  const APPS = [
    { id: 'openai', name: 'ChatGPT', url: 'https://a', logo: '', supportedRegions: ['CN', 'Global'] },
    { id: 'gemini', name: 'Gemini', url: 'https://b', logo: '', supportedRegions: ['CN', 'Global'] },
    { id: 'doubao', name: 'Doubao', url: 'https://c', logo: '', supportedRegions: ['CN'] }
  ] as never[]
  return { APPS }
})

vi.mock('@renderer/config/minapps', () => ({
  allMinApps: APPS,
  ORIGIN_DEFAULT_MIN_APPS: APPS,
  loadCustomMiniApp: async () => [],
  updateAllMinApps: () => undefined
}))

const makeStore = () =>
  configureStore({
    reducer: {
      minapps: minAppsReducer,
      settings: () => ({}),
      runtime: () => ({})
    }
  })

const wrapper = ({ children }: { children: ReactNode }) => <Provider store={makeStore()}>{children}</Provider>

describe('useMinapps — 不再按地区过滤', () => {
  // 该用例在测试体内动态 import '@renderer/hooks/useMinapps'，会一次性转换其庞大的
  // 模块依赖图：单独跑约 9s，全量并行跑（多个 worker 同时转换）会超过默认 20s 上限，
  // 因而偶发超时失败。这里显式放宽超时，避免与实现无关的假失败。
  it('默认返回全部小程序，包括 CN-only 的', { timeout: 60_000 }, async () => {
    const { useMinapps } = await import('@renderer/hooks/useMinapps')
    const { result } = renderHook(() => useMinapps(), { wrapper })

    expect(result.current.minapps.map((a) => a.id)).toEqual(['openai', 'gemini', 'doubao'])
    expect(result.current.disabled).toHaveLength(0)
  })

  it('拖进隐藏区后仅该应用消失，其余不受影响', async () => {
    const { useMinapps } = await import('@renderer/hooks/useMinapps')
    const { result } = renderHook(() => useMinapps(), { wrapper })

    await act(async () => {
      result.current.updateMinapps(APPS.filter((a) => (a as { id: string }).id !== 'doubao'))
      result.current.updateDisabledMinapps([APPS[2]])
    })

    expect(result.current.minapps.map((a) => a.id)).toEqual(['openai', 'gemini'])
    expect(result.current.disabled.map((a) => a.id)).toEqual(['doubao'])
  })
})
