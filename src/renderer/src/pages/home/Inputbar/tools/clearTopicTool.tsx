import { ActionIconButton } from '@renderer/components/Buttons'
import { useShortcutDisplay } from '@renderer/hooks/useShortcuts'
import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'
import { Tooltip } from 'antd'
import { PaintbrushVertical } from 'lucide-react'

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
      <Tooltip placement="top" title={`清空消息 ${clearTopicShortcut}`} mouseLeaveDelay={0} arrow>
        <ActionIconButton onClick={actions.clearTopic}>
          <PaintbrushVertical size={18} />
        </ActionIconButton>
      </Tooltip>
    )
  }
})

registerTool(clearTopicTool)

export default clearTopicTool
