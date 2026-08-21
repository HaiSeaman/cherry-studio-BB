import { useEffect } from 'react'

/**
 * 允许通过 postMessage 从 webview(小程序)调用 window.api 的方法白名单。
 *
 * 安全原则：只放行「只读 / 无副作用 / 无法访问本地文件系统」的方法。
 * 绝不放行 file 读写删除、fs、automation(系统文件/电源)、backup、config.set、
 * shell 等敏感能力——否则任意 file:// 页面(如被配置为自定义小程序的本地 HTML)
 * 都能借桥读取、修改甚至删除用户文件。
 */
const ALLOWED_API_METHODS: ReadonlySet<string> = new Set([
  // 只读应用信息
  'getAppInfo',
  'getDiskInfo',
  'getSystemFonts',
  'getCacheSize',
  'isBinaryExist',
  // 只读路径查询
  'resolvePath',
  'isPathInside',
  'hasWritePermission',
  'isNotEmptyDir',
  // 窗口只读状态
  'isFullScreen',
  // 打开外链（主进程 isSafeExternalUrl 校验协议白名单，无文件系统能力）
  'openWebsite'
])

interface BridgeRequest {
  type?: unknown
  method?: unknown
  args?: unknown
  id?: unknown
}

/**
 * 桥接 webview 页面与 window.api（供自定义小程序等本地页面使用）。
 *
 * 安全加固（原实现可被任意 file:// 页面调用全部 API，属高危漏洞）：
 * 1. origin 必须是 file://（本地页面）
 * 2. event.source 必须是「当前文档内某个 <webview> 的 contentWindow」，
 *    杜绝普通 iframe / 独立窗口 / 被注入的页面伪造调用
 * 3. method 必须命中白名单（只读方法）
 * 4. 消息结构必须合法（type === 'api-call'、method 为字符串、args 为数组）
 *
 * 任意一条不满足即静默忽略，不向发送方回传任何信息。
 */
export function useBridge() {
  useEffect(() => {
    const isTrustedWebviewSource = (source: MessageEvent['source']): boolean => {
      if (!source || typeof source !== 'object') {
        return false
      }
      const webviews = document.querySelectorAll<HTMLElement & { contentWindow?: Window | null }>('webview')
      for (const wv of webviews) {
        // contentWindow 只有在 webview 完成加载后才可用；直接比对引用
        if (wv.contentWindow === source) {
          return true
        }
      }
      return false
    }

    const handleMessage = async (event: MessageEvent<BridgeRequest>) => {
      try {
        // 1. 仅接受本地 file:// 页面
        if (event.origin !== 'file://') {
          return
        }
        // 2. 仅接受当前文档内 <webview> 的 contentWindow 发来的消息
        if (!isTrustedWebviewSource(event.source)) {
          return
        }
        // 3. 结构校验
        const { type, method, args, id } = event.data ?? {}
        if (type !== 'api-call') {
          return
        }
        if (typeof method !== 'string' || !ALLOWED_API_METHODS.has(method)) {
          return
        }
        if (!Array.isArray(args)) {
          return
        }
        if (!window.api) {
          return
        }

        const apiMethod = (window.api as Record<string, unknown>)[method]
        if (typeof apiMethod !== 'function') {
          return
        }

        event.source?.postMessage(
          {
            id,
            type: 'api-response',
            result: await (apiMethod as (...a: unknown[]) => Promise<unknown>)(...args)
          },
          { targetOrigin: 'file://' }
        )
      } catch (error) {
        event.source?.postMessage(
          {
            id: event.data?.id,
            type: 'api-response',
            error: error instanceof Error ? error.message : String(error)
          },
          { targetOrigin: 'file://' }
        )
      }
    }

    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])
}
