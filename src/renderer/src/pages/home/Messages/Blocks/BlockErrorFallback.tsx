import { isProd } from '@renderer/config/constant'
import type { ComponentType } from 'react'
import type { FallbackProps } from 'react-error-boundary'
const BlockErrorFallback: ComponentType<FallbackProps> = ({ error }) => {
  return (
    <div className="rounded-lg border border-(--color-status-warning,#faad14) border-dashed bg-[color-mix(in_srgb,var(--color-status-warning)_4%,transparent)] px-3 py-2 text-xs">
      <div className="text-(--color-status-warning,#faad14)">{'此内容块渲染失败'}</div>
      {!isProd && error && <div className="mt-1 break-all font-mono text-(--color-text-3)">{error.message}</div>}
    </div>
  )
}

export default BlockErrorFallback
