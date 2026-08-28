import { ChevronLeft, Plus } from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import styled from 'styled-components'

import HabitDetail from './components/HabitDetail'
import HabitForm from './components/HabitForm'
import HabitManage from './components/HabitManage'
import MonthCalendar from './components/MonthCalendar'
import { mx, MXTabs } from './components/mx'
import StatsCards from './components/StatsCards'
import StatsView from './components/StatsView'
import { useActiveHabits, useAllRecords } from './hooks/useHabits'
import { todayISO } from './services/calendar'
import type { Habit } from './types'

type ViewKey = 'calendar' | 'stats' | 'manage'

/**
 * 打卡 TAB（Habit Tracker）主页面
 * 三视图：月历打卡 / 统计 / 习惯管理；跨午夜自动刷新「今天」
 */
const HabitsPage: FC = () => {
  const [view, setView] = useState<ViewKey>('calendar')
  const [today, setToday] = useState(todayISO())
  const [formOpen, setFormOpen] = useState(false)
  const [detailHabit, setDetailHabit] = useState<Habit | null>(null)

  const habits = useActiveHabits()
  const allRecords = useAllRecords()

  // 跨午夜自刷新：分钟级检查日期字符串变化，变化即重渲染（数据由 useLiveQuery 驱动）
  useEffect(() => {
    const timer = setInterval(() => {
      const t = todayISO()
      setToday((prev) => (prev === t ? prev : t))
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <Container>
      <Header>
        <HeaderLeft>
          {detailHabit ? (
            <BackBtn onClick={() => setDetailHabit(null)}>
              <ChevronLeft size={14} /> 返回
            </BackBtn>
          ) : (
            <MXTabs<ViewKey>
              value={view}
              onChange={(v) => {
                setView(v)
                setDetailHabit(null)
              }}
              options={[
                { value: 'calendar', label: '打卡' },
                { value: 'stats', label: '统计' },
                { value: 'manage', label: '习惯管理' }
              ]}
            />
          )}
        </HeaderLeft>
        <AddBtn onClick={() => setFormOpen(true)}>
          <Plus size={14} /> 添加习惯
        </AddBtn>
      </Header>

      {detailHabit ? (
        <DetailArea>
          <HabitDetail habit={detailHabit} today={today} allRecords={allRecords} />
        </DetailArea>
      ) : (
        <Body>
          {habits.length === 0 ? (
            <Empty>
              <div className="big">🌱</div>
              <div className="line1">从一个习惯开始</div>
              <div className="line2">点右上角「添加习惯」，建第一个打卡（如 🚭 戒烟 / 💧 喝水 / 🏃 运动）</div>
            </Empty>
          ) : (
            <>
              {view === 'calendar' && (
                <CalendarArea>
                  <StatsCards habits={habits} allRecords={allRecords} today={today} />
                  <MonthCalendar today={today} onOpenDetail={setDetailHabit} />
                </CalendarArea>
              )}
              {view === 'stats' && (
                <ScrollY>
                  <StatsView habits={habits} allRecords={allRecords} today={today} />
                </ScrollY>
              )}
              {view === 'manage' && (
                <ScrollY>
                  <HabitManage />
                </ScrollY>
              )}
            </>
          )}
        </Body>
      )}

      <HabitForm open={formOpen} onClose={() => setFormOpen(false)} />
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

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px 10px;
`

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`

const BackBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid transparent;
  background: ${mx.soft};
  color: ${mx.text2};
  font-size: 12.5px;
  padding: 5px 12px 5px 8px;
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.15s ease;
  &:hover {
    color: ${mx.accent};
  }
`

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid ${mx.border};
  background: ${mx.card};
  color: ${mx.text};
  font-size: 12.5px;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  &:hover {
    color: ${mx.accent};
    border-color: ${mx.accent};
  }
`

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 4px 16px 16px;
`

/* 打卡视图：月历弹性占满剩余高度（列/行均拉伸，最大化铺满） */
const CalendarArea = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

/* 统计/管理视图：内容自适应高度，超出滚动 */
const ScrollY = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
`

const DetailArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 16px;
`

const Empty = styled.div`
  margin-top: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  .big {
    font-size: 44px;
  }
  .line1 {
    font-size: 15px;
    font-weight: 600;
    color: ${mx.text2};
  }
  .line2 {
    font-size: 12.5px;
    color: ${mx.text3};
  }
`

export default HabitsPage
