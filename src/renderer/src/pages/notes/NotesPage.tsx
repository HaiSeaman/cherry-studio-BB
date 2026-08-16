import { Navbar, NavbarMain } from '@renderer/components/app/Navbar'
import { type FC } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import styled from 'styled-components'

import { db } from '@renderer/databases'

import AlarmPanel from './components/AlarmPanel'
import { mx } from './components/mx'
import { useAlarmEngine } from './services/alarmScheduler'

/**
 * 闹钟便签工作台（晨间绿洲浅色主题）
 * 2×2 四宫格：左上便签 / 右上闹钟 / 左下待办 / 右下日历，窄屏单列滚动
 * 闹钟调度器为应用级单例，页面卸载后仍持续检查（离开本页闹钟照常响）
 */
const NotesPage: FC = () => {
  const alarms = useLiveQuery(async () => (await db.hub_alarms.toArray()) ?? [], [], [])
  const { ringing, stopRinging } = useAlarmEngine(alarms ?? [])

  return (
    <Container>
      <Navbar>
        <NavbarMain>{'闹钟便签'}</NavbarMain>
      </Navbar>
      <MainArea>
        <Cell>便签（建设中）</Cell>
        <AlarmPanelCell>
          <AlarmPanel ringing={ringing} onStopRinging={stopRinging} />
        </AlarmPanelCell>
        <Cell>待办事项（建设中）</Cell>
        <Cell>日历（建设中）</Cell>
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

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  box-shadow: ${mx.shadow};
  padding: 12px;
  overflow: hidden;
  color: ${mx.text3};
  align-items: center;
  justify-content: center;
  &:nth-child(1) {
    grid-area: notes;
  }
  &:nth-child(3) {
    grid-area: todos;
  }
  &:nth-child(4) {
    grid-area: calendar;
  }
`

const AlarmPanelCell = styled.div`
  grid-area: alarm;
  display: flex;
  min-width: 0;
  min-height: 0;
`

export default NotesPage
