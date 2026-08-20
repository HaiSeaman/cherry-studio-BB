import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FC } from 'react'
import styled from 'styled-components'

import FmRadio from '../music/components/FmRadio'
import LocalMusicPlayer from '../music/components/LocalMusicPlayer'
import AlarmPanel from './components/AlarmPanel'
import CalendarPanel from './components/CalendarPanel'
import { mx } from './components/mx'
import NotesPanel from './components/NotesPanel'
import TodoPanel from './components/TodoPanel'
import { useAlarmEngine } from './services/alarmScheduler'

/**
 * 个人效率中控台（晨间绿洲浅色主题）
 * 2×2 四宫格：左上 便签(列表3+内容7，内容区上下拆：便签编辑器+待办) / 右上闹钟 / 左下 音乐(FM 左右并排) / 右下日历
 * 闹钟调度器与音频引擎均为应用级单例，页面卸载后闹钟照响、音乐照播
 */
const NotesPage: FC = () => {
  const alarms = useLiveQuery(async () => (await db.hub_alarms.toArray()) ?? [], [], [])
  const { ringing } = useAlarmEngine(alarms ?? [])

  return (
    <Container>
      <MainArea>
        <NotesCell>
          {/* 上半：便签编辑器；下半：待办事项（完整功能页，随容器自适应滚动） */}
          <NotesPanel bottomSlot={<TodoPanel />} />
        </NotesCell>
        <AlarmPanelCell>
          <AlarmPanel ringing={ringing} />
        </AlarmPanelCell>
        <MusicCell>
          {/* 左本地音乐 / 右 FM 电台，5:5 并排；播放逻辑复用 audioEngine 单例，切页不断播 */}
          <LocalMusicPlayer />
          <FmRadio />
        </MusicCell>
        <CalendarPanel />
      </MainArea>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: ${mx.paper};
  [navbar-position='left'] & {
    max-width: calc(100vw - var(--sidebar-width));
  }
  [navbar-position='top'] & {
    max-width: 100vw;
  }
`

const MainArea = styled.div`
  display: grid;
  flex: 1;
  gap: 12px;
  height: 100%;
  padding: 12px;
  overflow: hidden;
  background: ${mx.paper};
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    'notes alarm'
    'music calendar';
  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-template-areas: 'notes' 'music' 'alarm' 'calendar';
    overflow-y: auto;
  }
`

const AlarmPanelCell = styled.div`
  grid-area: alarm;
  display: flex;
  min-width: 0;
  min-height: 0;
`

/** 左上格：便签+待办合并面板（面板内部自带列表/内容分区） */
const NotesCell = styled.div`
  grid-area: notes;
  display: flex;
  min-width: 0;
  min-height: 0;
`

/**
 * 左下格：音乐工作台一体化卡片（左本地音乐 / 右 FM 电台 5:5，中间细分隔线）。
 * 容器自带卡片视觉，内部两张 MXCard 去壳（边框/圆角/背景）成为分区。
 */
const MusicCell = styled.div`
  grid-area: music;
  display: flex;
  min-width: 0;
  min-height: 0;
  padding: 0;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  box-shadow: ${mx.shadow};
  overflow: hidden;

  /* 去掉内部两张卡片的独立外壳，融入一体卡片 */
  > * {
    flex: 1;
    min-width: 0;
    min-height: 0;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  /* 中间分隔线（窄屏堆叠时变横线） */
  > *:first-child {
    border-right: 1px solid ${mx.border} !important;
  }

  @media (max-width: 1000px) {
    flex-direction: column;
    > *:first-child {
      border-right: none !important;
      border-bottom: 1px solid ${mx.border} !important;
    }
  }
`

export default NotesPage
