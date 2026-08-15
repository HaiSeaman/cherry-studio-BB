import type { ActionTool } from '@renderer/components/ActionTools'
import { TOOL_SPECS, useToolManager } from '@renderer/components/ActionTools'
import { Text as UnWrapIcon, WrapText as WrapIcon } from 'lucide-react'
import { useCallback, useEffect } from 'react'
interface UseWrapToolProps {
  enabled?: boolean
  wrapped?: boolean
  wrappable?: boolean
  toggle: () => void
  setTools: React.Dispatch<React.SetStateAction<ActionTool[]>>
}

export const useWrapTool = ({ enabled, wrapped, wrappable, toggle, setTools }: UseWrapToolProps) => {
  const { registerTool, removeTool } = useToolManager(setTools)

  const handleToggle = useCallback(() => {
    toggle?.()
  }, [toggle])

  useEffect(() => {
    if (enabled) {
      registerTool({
        ...TOOL_SPECS.wrap,
        icon: wrapped ? <UnWrapIcon className="tool-icon" /> : <WrapIcon className="tool-icon" />,
        tooltip: wrapped ? '取消换行' : '换行',
        visible: () => wrappable ?? false,
        onClick: handleToggle
      })
    }

    return () => removeTool(TOOL_SPECS.wrap.id)
  }, [enabled, handleToggle, registerTool, removeTool, wrapped, wrappable])
}
