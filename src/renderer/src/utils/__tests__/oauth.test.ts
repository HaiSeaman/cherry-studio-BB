import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  oauthWith302AI,
  oauthWithAihubmix,
  oauthWithAiOnly,
  oauthWithSiliconFlow
} from '../oauth'

/**
 * OAuth postMessage 回传 origin 校验测试：
 * 只接受各自 OAuth 服务商官方域名的消息，防止任意网页注入伪造的 API key。
 */

function dispatchOauthMessage(origin: string, data: unknown) {
  const event = new MessageEvent('message', { origin, data })
  window.dispatchEvent(event)
}

describe('oauth origin 校验', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue({ close: vi.fn() } as unknown as Window)
    // oauthWithAihubmix 失败时会调用 window.toast.error / window.api.aes.decrypt
    ;(window as unknown as { toast?: { error: ReturnType<typeof vi.fn> } }).toast = { error: vi.fn() }
    ;(window as unknown as { api?: { aes?: { decrypt: ReturnType<typeof vi.fn> } } }).api = {
      aes: { decrypt: vi.fn().mockRejectedValue(new Error('secret not configured')) }
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('oauthWithSiliconFlow：非官方 origin 的回传被拒绝', async () => {
    const setKey = vi.fn()
    void oauthWithSiliconFlow(setKey)

    dispatchOauthMessage('https://evil.example.com', [{ secretKey: 'MALICIOUS_KEY' }])
    await new Promise((r) => setTimeout(r, 10))
    expect(setKey).not.toHaveBeenCalled()

    dispatchOauthMessage('https://account.siliconflow.cn', [{ secretKey: 'REAL_KEY' }])
    await new Promise((r) => setTimeout(r, 10))
    expect(setKey).toHaveBeenCalledWith('REAL_KEY')
  })

  it('oauthWithAihubmix：非官方 origin 的回传被拒绝', async () => {
    const setKey = vi.fn()
    void oauthWithAihubmix(setKey)

    dispatchOauthMessage('https://evil.example.com', { key: 'cherry_studio_oauth_callback', data: { iv: 'x', encryptedData: 'y' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(setKey).not.toHaveBeenCalled()

    // 正确 origin 但缺少解密依赖时会走 catch 分支，不会设置 key（验证不被恶意注入）
    dispatchOauthMessage('https://console.inferera.com', { key: 'cherry_studio_oauth_callback', data: { iv: 'x', encryptedData: 'y' } })
    await new Promise((r) => setTimeout(r, 30))
    expect(setKey).not.toHaveBeenCalled()
  })

  it('oauthWith302AI：非官方 origin 的回传被拒绝', async () => {
    const setKey = vi.fn()
    void oauthWith302AI(setKey)

    dispatchOauthMessage('https://evil.example.com', { data: { apikey: 'MALICIOUS_KEY' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(setKey).not.toHaveBeenCalled()

    dispatchOauthMessage('https://dash.302.ai', { data: { apikey: 'REAL_KEY' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(setKey).toHaveBeenCalledWith('REAL_KEY')
  })

  it('oauthWithAiOnly：非官方 origin 的回传被拒绝', async () => {
    const setKey = vi.fn()
    void oauthWithAiOnly(setKey)

    dispatchOauthMessage('https://evil.example.com', [{ secretKey: 'MALICIOUS_KEY' }])
    await new Promise((r) => setTimeout(r, 10))
    expect(setKey).not.toHaveBeenCalled()

    dispatchOauthMessage('https://maas.aiionly.com', [{ secretKey: 'REAL_KEY' }])
    await new Promise((r) => setTimeout(r, 10))
    expect(setKey).toHaveBeenCalledWith('REAL_KEY')
  })
})
