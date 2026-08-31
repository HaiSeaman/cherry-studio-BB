import { resolveValidTopicId, useLiveAssistant } from '@renderer/hooks/useAssistant'
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
  // 必须用 Redux 实时助手做归属校验：父组件传来的 assistant 可能是挂载时的快照，
  // 其 topics 不含之后新建的话题，会把新建会话误判为不属于本助手（内容区空白、生成写进孤儿话题）
  const liveAssistant = useLiveAssistant(assistant)

  // 校验 activeTopic 仍属于本助手（详见 resolveValidTopicId）
  const validTopicId = resolveValidTopicId(liveAssistant, activeTopic)

  return (
    <Container id="paint-workspace">
      <PaintHistoryList assistant={liveAssistant} activeTopicId={validTopicId} onSelect={setActiveTopic} />
      <Main>
        <PaintContent topicId={validTopicId} assistantId={liveAssistant.id} />
        <PaintInputbar topicId={validTopicId} assistantId={liveAssistant.id} onTopicChange={setActiveTopic} />
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
