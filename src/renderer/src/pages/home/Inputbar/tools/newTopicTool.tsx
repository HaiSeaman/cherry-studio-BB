import { useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'
import { MessageSquareDiff } from 'lucide-react'

import ToolActionIconButton from './components/ToolActionIconButton'

const newTopicTool = defineTool({
  key: 'new_topic',
  label: '新话题',

  visibleInScopes: [TopicType.Chat],

  dependencies: {
    actions: ['addNewTopic'] as const
  },

  render: function NewTopicRender(context) {
    const { actions } = context
    const newTopicShortcut = useShortcutDisplay('new_topic')

    return (
      <ToolActionIconButton tooltip={`新话题 ${newTopicShortcut}`} onClick={actions.addNewTopic}>
        <MessageSquareDiff size={19} />
      </ToolActionIconButton>
    )
  }
})

// Register the tool
registerTool(newTopicTool)

export default newTopicTool
