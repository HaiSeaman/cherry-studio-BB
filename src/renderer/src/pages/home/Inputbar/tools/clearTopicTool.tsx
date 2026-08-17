import { useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'
import { PaintbrushVertical } from 'lucide-react'

import ToolActionIconButton from './components/ToolActionIconButton'

const clearTopicTool = defineTool({
  key: 'clear_topic',
  label: '清空消息',
  visibleInScopes: [TopicType.Chat],
  dependencies: {
    actions: ['clearTopic'] as const
  },
  render: function ClearTopicRender(context) {
    const { actions } = context
    const clearTopicShortcut = useShortcutDisplay('clear_topic')

    return (
      <ToolActionIconButton tooltip={`清空消息 ${clearTopicShortcut}`} onClick={actions.clearTopic}>
        <PaintbrushVertical size={18} />
      </ToolActionIconButton>
    )
  }
})

registerTool(clearTopicTool)

export default clearTopicTool
