import { resolveValidTopicId, useLiveAssistant } from '@renderer/hooks/useAssistant'
import type { Assistant, Topic } from '@renderer/types'
import { type FC, useState } from 'react'
import styled from 'styled-components'

import VideoContent from '../video/VideoContent'
import VideoHistoryList from '../video/VideoHistoryList'
import VideoInputbar from '../video/VideoInputbar'

interface Props {
  assistant: Assistant
  activeTopic: Topic | undefined
  setActiveTopic: (topic: Topic) => void
}

/**
 * 视频助手工作区：挂在 HomePage 的 Chat 位置
 * 左=生成历史列表（各会话视频数，可切换/删除）；右=消息流 + 视频输入栏
 */
const VideoWorkspace: FC<Props> = ({ assistant, activeTopic, setActiveTopic }) => {
  // 必须用 Redux 实时助手做归属校验：父组件传来的 assistant 可能是挂载时的快照，
  // 其 topics 不含之后新建的话题，会把新建会话误判为不属于本助手（同 PaintWorkspace）
  const liveAssistant = useLiveAssistant(assistant)

  // 校验 activeTopic 仍属于本助手（详见 resolveValidTopicId）
  const validTopicId = resolveValidTopicId(liveAssistant, activeTopic)

  // 生成中状态提升到本层：历史列表要在生成期间禁用「新建会话」，
  // 否则切到新会话后在途结果仍写回旧会话，表现成「生成了但看不见」
  const [isGenerating, setIsGenerating] = useState(false)

  return (
    <Container id="video-workspace">
      <VideoHistoryList
        assistant={liveAssistant}
        activeTopicId={validTopicId}
        isGenerating={isGenerating}
        onSelect={setActiveTopic}
      />
      <Main>
        <VideoContent topicId={validTopicId} />
        <VideoInputbar
          topicId={validTopicId}
          assistantId={liveAssistant.id}
          isGenerating={isGenerating}
          setIsGenerating={setIsGenerating}
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

export default VideoWorkspace
