import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useBridge } from '../useBridge'

/**
 * useBridge 安全加固测试：
 * 1. 只接受 file:// origin
 * 2. 只接受当前文档内 <webview> 的 contentWindow 作为 source
 * 3. 只放行白名单方法（getAppInfo 等只读方法）
 * 4. 拒绝敏感方法（file.delete / fs.read / automation.sysFileWrite 等）
 * 5. 消息结构非法时静默忽略
 */

// 模拟两个"webview"的 contentWindow
type MockWindow = Window & { postMessage: ReturnType<typeof vi.fn> }
const trustedSource = { postMessage: vi.fn(), trusted: true } as unknown as MockWindow
const untrustedSource = { postMessage: vi.fn(), trusted: false } as unknown as MockWindow

// 模拟 window.api
const apiMock = {
  getAppInfo: vi.fn().mockResolvedValue({ version: '1.0.0' }),
  getDiskInfo: vi.fn().mockResolvedValue({ free: 1, size: 2 }),
  openWebsite: vi.fn().mockResolvedValue(undefined),
  file: {
    delete: vi.fn(),
    read: vi.fn()
  },
  fs: {
    read: vi.fn()
  },
  automation: {
    sysFileWrite: vi.fn()
  }
}

function dispatchMessage(payload: unknown, opts: { origin?: string; source?: Window | null } = {}) {
  const event = new MessageEvent('message', {
    origin: opts.origin ?? 'file://',
    source: opts.source ?? trustedSource,
    data: payload
  })
  window.dispatchEvent(event)
}

describe('useBridge', () => {
  beforeEach(() => {
    // 在 document 中放置一个 webview 元素，其 contentWindow 指向 trustedSource
    const webview = document.createElement('webview') as HTMLElement & { contentWindow?: Window | null }
    webview.contentWindow = trustedSource
    document.body.appendChild(webview)

    Object.defineProperty(window, 'api', { value: apiMock, configurable: true, writable: true })
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    // @ts-expect-error - test cleanup
    delete window.api
  })

  it('白名单方法可从受信任 webview 调用并回传结果', async () => {
    renderHook(() => useBridge())

    dispatchMessage({ type: 'api-call', method: 'getAppInfo', args: [], id: 'req-1' })

    await vi.waitFor(() => {
      expect(trustedSource.postMessage).toHaveBeenCalled()
    })

    const call = trustedSource.postMessage.mock.calls[0]
    expect(call[0]).toEqual({ id: 'req-1', type: 'api-response', result: { version: '1.0.0' } })
    expect(call[1]).toEqual({ targetOrigin: 'file://' })
    expect(apiMock.getAppInfo).toHaveBeenCalledTimes(1)
  })

  it('非白名单方法（文件删除）被拒绝，不调用 API 不回传', async () => {
    renderHook(() => useBridge())

    dispatchMessage({ type: 'api-call', method: 'file.delete', args: ['x'], id: 'req-2' })

    await new Promise((r) => setTimeout(r, 20))
    expect(apiMock.file.delete).not.toHaveBeenCalled()
    expect(trustedSource.postMessage).not.toHaveBeenCalled()
  })

  it('非白名单方法（automation.sysFileWrite）被拒绝', async () => {
    renderHook(() => useBridge())

    dispatchMessage({ type: 'api-call', method: 'automation.sysFileWrite', args: ['/etc/passwd', 'evil'], id: 'r' })

    await new Promise((r) => setTimeout(r, 20))
    expect(apiMock.automation.sysFileWrite).not.toHaveBeenCalled()
    expect(trustedSource.postMessage).not.toHaveBeenCalled()
  })

  it('非白名单方法（fs.read）被拒绝', async () => {
    renderHook(() => useBridge())

    dispatchMessage({ type: 'api-call', method: 'fs.read', args: ['/etc/passwd'], id: 'r' })

    await new Promise((r) => setTimeout(r, 20))
    expect(apiMock.fs.read).not.toHaveBeenCalled()
    expect(trustedSource.postMessage).not.toHaveBeenCalled()
  })

  it('非 webview 来源（普通 iframe/独立窗口）的消息被拒绝', async () => {
    renderHook(() => useBridge())

    dispatchMessage({ type: 'api-call', method: 'getAppInfo', args: [], id: 'req-3' }, { source: untrustedSource })

    await new Promise((r) => setTimeout(r, 20))
    expect(apiMock.getAppInfo).not.toHaveBeenCalled()
    expect(untrustedSource.postMessage).not.toHaveBeenCalled()
  })

  it('非 file:// origin 的消息被拒绝', async () => {
    renderHook(() => useBridge())

    dispatchMessage(
      { type: 'api-call', method: 'getAppInfo', args: [], id: 'req-4' },
      { origin: 'https://evil.example.com' }
    )

    await new Promise((r) => setTimeout(r, 20))
    expect(apiMock.getAppInfo).not.toHaveBeenCalled()
    expect(trustedSource.postMessage).not.toHaveBeenCalled()
  })

  it('消息结构非法（type 不符 / method 非字符串 / args 非数组）被拒绝', async () => {
    renderHook(() => useBridge())

    dispatchMessage({ type: 'other', method: 'getAppInfo', args: [], id: 'a' })
    dispatchMessage({ type: 'api-call', method: 123, args: [], id: 'b' })
    dispatchMessage({ type: 'api-call', method: 'getAppInfo', args: 'not-array', id: 'c' })
    dispatchMessage({ data: null })

    await new Promise((r) => setTimeout(r, 20))
    expect(apiMock.getAppInfo).not.toHaveBeenCalled()
    expect(trustedSource.postMessage).not.toHaveBeenCalled()
  })

  it('取消订阅后不再响应消息', async () => {
    const { unmount } = renderHook(() => useBridge())
    unmount()

    dispatchMessage({ type: 'api-call', method: 'getAppInfo', args: [], id: 'req-5' })

    await new Promise((r) => setTimeout(r, 20))
    expect(apiMock.getAppInfo).not.toHaveBeenCalled()
    expect(trustedSource.postMessage).not.toHaveBeenCalled()
  })

  it('API 抛错时回传 error 字段', async () => {
    apiMock.getAppInfo.mockRejectedValueOnce(new Error('boom'))
    renderHook(() => useBridge())

    dispatchMessage({ type: 'api-call', method: 'getAppInfo', args: [], id: 'req-6' })

    await vi.waitFor(() => {
      expect(trustedSource.postMessage).toHaveBeenCalled()
    })
    const call = trustedSource.postMessage.mock.calls[0]
    expect(call[0]).toEqual({ id: 'req-6', type: 'api-response', error: 'boom' })
  })
})
