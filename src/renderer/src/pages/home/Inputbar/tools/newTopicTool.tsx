import { ActionIconButton } from '@renderer/components/Buttons'
import { useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'
import { Tooltip } from 'antd'
import { MessageSquareDiff } from 'lucide-react'

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
      <Tooltip placement="top" title={`新话题 ${newTopicShortcut}`} mouseLeaveDelay={0} arrow>
        <ActionIconButton onClick={actions.addNewTopic}>
          <MessageSquareDiff size={19} />
        </ActionIconButton>
      </Tooltip>
    )
  }
})

// Register the tool
registerTool(newTopicTool)

export default newTopicTool
