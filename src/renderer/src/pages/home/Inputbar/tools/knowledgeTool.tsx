import { defineTool, registerTool, TopicType } from '@renderer/pages/home/Inputbar/types'

import KnowledgeButton from './components/KnowledgeButton'

/**
 * 知识库工具：挂在聊天输入栏工具栏（与网络搜索/MCP 同排）。
 * 点击展开多选库，发送时检索并把命中文段注入消息。
 */
const knowledgeTool = defineTool({
  key: 'knowledge',
  label: '知识库',

  visibleInScopes: [TopicType.Chat],

  render: (context) => <KnowledgeButton quickPanelController={context.quickPanelController} />
})

registerTool(knowledgeTool)

export default knowledgeTool
