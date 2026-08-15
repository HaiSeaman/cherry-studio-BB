import type { ActionTool } from '@renderer/components/ActionTools'
import { TOOL_SPECS, useToolManager } from '@renderer/components/ActionTools'
import type { CodeEditorHandles } from '@renderer/components/CodeEditor'
import { useTemporaryValue } from '@renderer/hooks/useTemporaryValue'
import { Check, SaveIcon } from 'lucide-react'
import { useCallback, useEffect } from 'react'
interface UseSaveToolProps {
  enabled?: boolean
  sourceViewRef: React.RefObject<CodeEditorHandles | null>
  setTools: React.Dispatch<React.SetStateAction<ActionTool[]>>
}

export const useSaveTool = ({ enabled, sourceViewRef, setTools }: UseSaveToolProps) => {
  const [saved, setSavedTemporarily] = useTemporaryValue(false)
  const { registerTool, removeTool } = useToolManager(setTools)

  const handleSave = useCallback(() => {
    sourceViewRef.current?.save?.()
    setSavedTemporarily(true)
  }, [sourceViewRef, setSavedTemporarily])

  useEffect(() => {
    if (enabled) {
      registerTool({
        ...TOOL_SPECS.save,
        icon: saved ? (
          <Check className="tool-icon" color="var(--color-status-success)" />
        ) : (
          <SaveIcon className="tool-icon" />
        ),
        tooltip: '保存修改',
        onClick: handleSave
      })
    }

    return () => removeTool(TOOL_SPECS.save.id)
  }, [enabled, handleSave, registerTool, removeTool, saved])
}
