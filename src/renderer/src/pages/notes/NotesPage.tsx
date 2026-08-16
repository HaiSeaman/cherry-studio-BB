import { Navbar, NavbarMain } from '@renderer/components/app/Navbar'
import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FC } from 'react'
import styled from 'styled-components'

import AlarmPanel from './components/AlarmPanel'
import CalendarPanel from './components/CalendarPanel'
import { mx } from './components/mx'
import NotesPanel from './components/NotesPanel'
import TodoPanel from './components/TodoPanel'
import { useAlarmEngine } from './services/alarmScheduler'

/**
 * 闹钟便签工作台（晨间绿洲浅色主题）
 * 2×2 四宫格：左上便签 / 右上闹钟 / 左下待办 / 右下日历，窄屏单列滚动
 * 闹钟调度器为应用级单例，页面卸载后仍持续检查（离开本页闹钟照常响）
 */
const NotesPage: FC = () => {
  const alarms = useLiveQuery(async () => (await db.hub_alarms.toArray()) ?? [], [], [])
  const { ringing } = useAlarmEngine(alarms ?? [])

  return (
    <Container>
      <Navbar>
        <NavbarMain>{'闹钟便签'}</NavbarMain>
      </Navbar>
      <MainArea>
        <NotesPanel />
        <AlarmPanelCell>
          <AlarmPanel ringing={ringing} />
        </AlarmPanelCell>
        <TodoPanel />
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
  height: calc(100vh - var(--navbar-height));
  padding: 12px;
  overflow: hidden;
  background: ${mx.paper};
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    'notes alarm'
    'todos calendar';
  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-template-areas: 'notes' 'todos' 'alarm' 'calendar';
    overflow-y: auto;
  }
`

const AlarmPanelCell = styled.div`
  grid-area: alarm;
  display: flex;
  min-width: 0;
  min-height: 0;
`

export default NotesPage
