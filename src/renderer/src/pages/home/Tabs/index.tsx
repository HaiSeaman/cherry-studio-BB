import { useAssistants, useDefaultAssistant } from '@renderer/hooks/useAssistant'
import { useNavbarPosition, useSettings } from '@renderer/hooks/useSettings'
import { useShowTopics } from '@renderer/hooks/useStore'
import { getDefaultTopic } from '@renderer/services/AssistantService'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { Assistant, AssistantType, Topic } from '@renderer/types'
import type { Tab } from '@renderer/types/chat'
import { classNames, uuid } from '@renderer/utils'
import { Modal } from 'antd'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import styled from 'styled-components'

import Assistants from './AssistantsTab'
import { Topics } from './components/Topics'

interface Props {
  activeAssistant: Assistant
  activeTopic: Topic
  setActiveAssistant: (assistant: Assistant) => void
  setActiveTopic: (topic: Topic) => void
  position: 'left' | 'right'
  style?: React.CSSProperties
}

let _tab: Tab | null = null

/** 助手创建模板：三形态向导（类型标识由默认 emoji 承载） */
const ASSISTANT_TEMPLATES: { type: AssistantType; emoji: string; title: string; name: string; desc: string }[] = [
  { type: 'chat', emoji: '💬', title: '通用对话助手', name: '新助手', desc: '标准聊天：消息流、模型选择、文件与工具' },
  {
    type: 'image_gen',
    emoji: '🎨',
    title: '灵感生图助手',
    name: '灵感生图',
    desc: '文字生成图片：参数胶囊、参考图、提示词优化'
  },
  {
    type: 'video_gen',
    emoji: '🎬',
    title: '动感视频助手',
    name: '动感视频',
    desc: '文字/图片生成视频：时长、分辨率、首帧参考图'
  },
  {
    type: 'automation',
    emoji: '⚡',
    title: '自动化任务助手',
    name: '自动化',
    desc: '定时执行 AI 任务，结果简报回流助手'
  }
]

const HomeTabs: FC<Props> = ({ activeAssistant, activeTopic, setActiveAssistant, setActiveTopic, position, style }) => {
  const { addAssistant } = useAssistants()
  const { topicPosition } = useSettings()
  const { defaultAssistant } = useDefaultAssistant()
  const { toggleShowTopics } = useShowTopics()
  const { isLeftNavbar } = useNavbarPosition()
  const [tab, setTab] = useState<Tab>(position === 'left' ? _tab || 'assistants' : 'topic')
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const borderStyle = '0.5px solid var(--color-border)'
  const border =
    position === 'left'
      ? { borderRight: isLeftNavbar ? borderStyle : 'none' }
      : { borderLeft: isLeftNavbar ? borderStyle : 'none', borderTopLeftRadius: 0 }

  if (position === 'left' && topicPosition === 'left') {
    _tab = tab
  }

  const showTab = position === 'left' && topicPosition === 'left'

  const onCreateAssistant = () => setTypePickerOpen(true)

  const createAssistantOfType = (type: AssistantType) => {
    setTypePickerOpen(false)
    const id = uuid()
    const template = ASSISTANT_TEMPLATES.find((t) => t.type === type)!
    // chat 保持既有行为（继承默认助手配置）；生图/自动化换名字/emoji 并配全新默认话题
    const assistant: Assistant = {
      ...defaultAssistant,
      id,
      type,
      ...(type === 'chat' ? {} : { name: template.name, emoji: template.emoji, topics: [getDefaultTopic(id)] })
    }
    addAssistant(assistant)
    setActiveAssistant(assistant)
  }

  useEffect(() => {
    const unsubscribes = [
      EventEmitter.on(EVENT_NAMES.SHOW_ASSISTANTS, (): any => {
        showTab && setTab('assistants')
      }),
      EventEmitter.on(EVENT_NAMES.SHOW_TOPIC_SIDEBAR, (): any => {
        showTab && setTab('topic')
      }),
      EventEmitter.on(EVENT_NAMES.SWITCH_TOPIC_SIDEBAR, () => {
        showTab && setTab('topic')
        if (position === 'left' && topicPosition === 'right') {
          toggleShowTopics()
        }
      })
    ]
    return () => unsubscribes.forEach((unsub) => unsub())
  }, [position, setTab, showTab, tab, toggleShowTopics, topicPosition])

  useEffect(() => {
    if (position === 'right' && topicPosition === 'right' && tab === 'assistants') {
      setTab('topic')
    }
    if (position === 'left' && topicPosition === 'right' && tab === 'topic') {
      setTab('assistants')
    }
  }, [position, tab, topicPosition])

  return (
    <Container
      style={{ ...border, ...style }}
      className={classNames('home-tabs', { right: position === 'right' && topicPosition === 'right' })}>
      {position === 'left' && topicPosition === 'left' && (
        <CustomTabs>
          <TabItem active={tab === 'assistants'} onClick={() => setTab('assistants')}>
            {'AI 助手'}
          </TabItem>
          <TabItem active={tab === 'topic'} onClick={() => setTab('topic')}>
            {'话题'}
          </TabItem>
        </CustomTabs>
      )}

      <TabContent className="home-tabs-content">
        {tab === 'assistants' && (
          <Assistants
            activeAssistant={activeAssistant}
            setActiveAssistant={setActiveAssistant}
            onCreateAssistant={onCreateAssistant}
          />
        )}
        {tab === 'topic' && (
          <Topics
            assistant={activeAssistant}
            activeTopic={activeTopic}
            setActiveTopic={setActiveTopic}
            position={position}
          />
        )}
      </TabContent>

      <Modal
        open={typePickerOpen}
        onCancel={() => setTypePickerOpen(false)}
        footer={null}
        title="选择助手类型"
        width={520}>
        <TemplateGrid>
          {ASSISTANT_TEMPLATES.map((t) => (
            <TemplateCard key={t.type} onClick={() => createAssistantOfType(t.type)}>
              <TemplateEmoji>{t.emoji}</TemplateEmoji>
              <TemplateName>{t.title}</TemplateName>
              <TemplateDesc>{t.desc}</TemplateDesc>
            </TemplateCard>
          ))}
        </TemplateGrid>
      </Modal>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: var(--assistants-width);
  transition: width 0.3s;
  /* 顶部导航已移除：与聊天页同高顶满窗口（否则底部留 42px 空隙） */
  height: 100vh;
  position: relative;

  &.right {
    height: 100vh;
  }

  [navbar-position='left'] & {
    background-color: var(--color-background);
  }
  [navbar-position='top'] & {
    height: calc(100vh - var(--navbar-height));
  }
  overflow: hidden;
  .collapsed {
    width: 0;
    border-left: none;
  }
`

const TabContent = styled.div`
  display: flex;
  transition: width 0.3s;
  flex: 1;
  flex-direction: column;
  overflow-y: hidden;
  overflow-x: hidden;
`

const CustomTabs = styled.div`
  display: flex;
  margin: 0 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  -webkit-app-region: no-drag;
  [navbar-position='top'] & {
    padding-top: 2px;
  }
`

const TabItem = styled.button<{ active: boolean }>`
  flex: 1;
  height: 30px;
  border: none;
  background: transparent;
  color: ${(props) => (props.active ? 'var(--color-text)' : 'var(--color-text-secondary)')};
  font-size: 13px;
  font-weight: ${(props) => (props.active ? '600' : '400')};
  cursor: pointer;
  border-radius: 8px;
  margin: 0 2px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--color-text);
  }

  &:active {
    transform: scale(0.98);
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: ${(props) => (props.active ? '30px' : '0')};
    height: 3px;
    background: var(--color-primary);
    border-radius: 1px;
    transition: all 0.2s ease;
  }

  &:hover::after {
    width: ${(props) => (props.active ? '30px' : '16px')};
    background: ${(props) => (props.active ? 'var(--color-primary)' : 'var(--color-primary-soft)')};
  }
`

export default HomeTabs

const TemplateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 4px 0 8px;
`

const TemplateCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 10px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-background-soft);
  }
`

const TemplateEmoji = styled.span`
  font-size: 28px;
`

const TemplateName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
`

const TemplateDesc = styled.div`
  font-size: 11px;
  color: var(--color-text-2);
  line-height: 1.4;
`
