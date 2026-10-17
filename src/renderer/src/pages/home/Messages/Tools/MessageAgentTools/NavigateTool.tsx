import { Compass } from 'lucide-react'

interface NavigateToolInput {
  path?: string
  query?: Record<string, string>
}

const ROUTE_LABELS: Record<string, { icon: string; label: string }> = {
  // 顶层页面（与 Router.tsx 实际注册的路由一一对应）
  '/': { icon: '🏠', label: 'Home' },
  '/apps': { icon: '📦', label: 'Mini Apps' },
  '/notes': { icon: '📝', label: '效率助手' },
  '/habits': { icon: '📅', label: '打卡' },
  '/knowledge': { icon: '📚', label: '知识库' },

  // 设置页（与 SettingsPage.tsx 的实际子路由一致）
  '/settings/provider': { icon: '🔑', label: 'Provider' },
  '/settings/model': { icon: '🤖', label: 'Models' },
  '/settings/general': { icon: '⚙️', label: 'General' },
  '/settings/display': { icon: '🖥️', label: 'Display' },
  '/settings/data': { icon: '💾', label: 'Data' },
  '/settings/mcp': { icon: '🔌', label: 'MCP' },
  '/settings/websearch': { icon: '🔍', label: 'Web Search' },
  '/settings/quickphrase': { icon: '⚡', label: 'Quick Phrases' },
  '/settings/shortcut': { icon: '⌨️', label: 'Shortcuts' },
  '/settings/quickAssistant': { icon: '🪟', label: 'Quick Assistant' },
  '/settings/selectionAssistant': { icon: '✂️', label: 'Selection Assistant' },

  // MCP 子页面
  '/settings/mcp/servers': { icon: '📋', label: 'MCP Servers' },

  // 网络搜索子页面
  '/settings/websearch/general': { icon: '🔍', label: 'Search Settings' }
}

// Sorted by path length descending for longest prefix match
const SORTED_ROUTES = Object.entries(ROUTE_LABELS).sort((a, b) => b[0].length - a[0].length)

function getRouteInfo(path: string): { icon: string; label: string } {
  // Exact match first
  if (ROUTE_LABELS[path]) return ROUTE_LABELS[path]

  // Strip query string for matching
  const cleanPath = path.split('?')[0]
  if (ROUTE_LABELS[cleanPath]) return ROUTE_LABELS[cleanPath]

  // Longest prefix match
  for (const [route, info] of SORTED_ROUTES) {
    if (cleanPath.startsWith(route + '/') || cleanPath === route) return info
  }

  return { icon: '📍', label: path }
}

/**
 * Inline navigate button rendered directly in message content.
 * Not a Collapse item — rendered as a simple clickable button.
 */
export function NavigateToolInline({
  input,
  output
}: {
  input?: NavigateToolInput | Record<string, unknown>
  output?: unknown
}) {
  const typedInput = input as NavigateToolInput | undefined
  const basePath = typedInput?.path ?? ''
  const queryObj = typedInput?.query

  // Build full path with query params
  let fullPath = basePath
  if (queryObj && typeof queryObj === 'object' && Object.keys(queryObj).length > 0) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(queryObj)) {
      if (typeof value === 'string') {
        params.set(key, value)
      }
    }
    const qs = params.toString()
    if (qs) {
      fullPath = `${basePath}?${qs}`
    }
  }

  const routeInfo = getRouteInfo(fullPath)

  const outputText =
    output && typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? (output as Array<{ text?: string }>)
            .map((o) => o?.text)
            .filter(Boolean)
            .join('')
        : ''
  const isSuccess = outputText.includes('Navigated to')

  const handleClick = () => {
    if (typeof window.navigate === 'function') {
      window.navigate(fullPath)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="my-1 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--color-border)] border-solid bg-[var(--color-background-soft)] px-3 py-1.5 text-[var(--color-text-1)] text-sm transition-colors hover:bg-[var(--color-background-mute)]"
      type="button">
      <Compass className="h-3.5 w-3.5 opacity-60" />
      <span>
        {routeInfo.icon} {routeInfo.label}
      </span>
      {isSuccess && <span className="text-green-500">✓</span>}
    </button>
  )
}
