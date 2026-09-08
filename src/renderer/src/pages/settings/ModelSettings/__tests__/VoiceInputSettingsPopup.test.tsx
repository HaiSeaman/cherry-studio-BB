import { DEFAULT_VOICE_INPUT_CONFIG } from '@shared/config/constant'
import type { VoiceInputConfig } from '@shared/config/types'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PopupContainer } from '../VoiceInputSettingsPopup'

const passwordInputs = () => document.querySelectorAll('input[type="password"]')

beforeEach(() => {
  // antd v5 在 jsdom 需要 matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })

  const configGet = vi.fn()
  const configSet = vi.fn()
  Object.defineProperty(window, 'api', {
    value: { config: { get: configGet, set: configSet } },
    configurable: true
  })
  ;(window.api.config.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

describe('VoiceInputSettingsPopup', () => {
  it('默认千问：渲染 API Key 密码框 + 模型名称输入框', async () => {
    render(<PopupContainer resolve={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('API Key')).toBeInTheDocument())
    expect(screen.getByText('模型名称')).toBeInTheDocument()
    expect(passwordInputs()).toHaveLength(1)
  })

  it('已选豆包：渲染 API Key 密码框 + 资源 ID 输入框', async () => {
    const saved: VoiceInputConfig = {
      ...structuredClone(DEFAULT_VOICE_INPUT_CONFIG),
      provider: 'doubao',
      doubao: { apiKey: 'db-key', resourceId: 'volc.seedasr.sauc.duration' }
    }
    ;(window.api.config.get as ReturnType<typeof vi.fn>).mockResolvedValue(saved)

    render(<PopupContainer resolve={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('资源 ID（模型名称）')).toBeInTheDocument())
    expect(screen.getByText('API Key（新版控制台 APP Key）')).toBeInTheDocument()
    expect(passwordInputs()).toHaveLength(1)
  })
})