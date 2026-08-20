import PaintContent from '@renderer/pages/paint/PaintContent'
import PaintHistoryList from '@renderer/pages/paint/PaintHistoryList'
import PaintInputbar from '@renderer/pages/paint/PaintInputbar'
import type { Assistant, Topic } from '@renderer/types'
import { type FC } from 'react'
import styled from 'styled-components'

interface Props {
  assistant: Assistant
  activeTopic: Topic | undefined
  setActiveTopic: (topic: Topic) => void
}

/**
 * 生图助手工作区：挂在 HomePage 的 Chat 位置
 * 左=生成历史列表（各会话缩略图/图片数，可切换/删除）；右=消息流 + 生图输入栏（复用绘画页组件）
 */
const PaintWorkspace: FC<Props> = ({ assistant, activeTopic, setActiveTopic }) => {
  // 校验 activeTopic 仍属于本助手：删光话题/跨助手切换时 useActiveTopic 可能残留
  // 已删话题（topics 为空不触发自动重置），失效 id 会导致内容区无限加载、生成写入已删话题
  const validTopicId =
    activeTopic && (assistant.topics ?? []).some((t) => t.id === activeTopic.id) ? activeTopic.id : null

  return (
    <Container id="paint-workspace">
      <PaintHistoryList assistant={assistant} activeTopicId={validTopicId} onSelect={setActiveTopic} />
      <Main>
        <PaintContent topicId={validTopicId} assistantId={assistant.id} />
        <PaintInputbar
          topicId={validTopicId}
          assistantId={assistant.id}
          onTopicChange={setActiveTopic}
        />
      </Main>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
`

const Main = styled.div`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
`

export default PaintWorkspace
