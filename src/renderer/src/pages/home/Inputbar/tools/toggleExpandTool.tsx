import type { ToolRenderContext } from '@renderer/pages/home/Inputbar/types'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'
import { Maximize, Minimize } from 'lucide-react'
import React, { useCallback } from 'react'

import ToolActionIconButton from './components/ToolActionIconButton'

type ToggleExpandRenderContext = ToolRenderContext<readonly ['isExpanded'], readonly ['toggleExpanded']>

const ToggleExpandTool: React.FC<{ context: ToggleExpandRenderContext }> = ({ context }) => {
  const { actions, state } = context
  const isExpanded = Boolean(state.isExpanded)

  const handleToggle = useCallback(() => {
    actions.toggleExpanded?.()
  }, [actions])

  return (
    <ToolActionIconButton tooltip={isExpanded ? '收起' : '展开'} onClick={handleToggle}>
      {isExpanded ? <Minimize size={18} /> : <Maximize size={18} />}
    </ToolActionIconButton>
  )
}

const toggleExpandTool = defineTool({
  key: 'toggle_expand',
  label: '展开',
  visibleInScopes: [TopicType.Chat, TopicType.Session],
  dependencies: {
    state: ['isExpanded'] as const,
    actions: ['toggleExpanded'] as const
  },
  render: (context) => <ToggleExpandTool context={context} />
})

registerTool(toggleExpandTool)

export default toggleExpandTool
