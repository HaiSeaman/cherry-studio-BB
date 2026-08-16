import { db } from '@renderer/databases'
import { useAppSelector } from '@renderer/store'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Flame, Plus } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import styled from 'styled-components'

import { ALARM_SOUND_OPTIONS } from '../services/alarmSounds'
import { buildMonthCells, heatmapRange, hmLevel, toISODate } from '../services/calendarUtils'
import type { HubAlarm } from '../types'
import { mx, MXDialog } from './mx'
import SoundPicker from './SoundPicker'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const HM_LEVEL_COLORS = ['#EDF5F0', '#A7E3C8', '#6ED4A6', '#34C08B', '#0E9F6E']

/** 右下卡片：365 天热力图 + 月历 + 当日闹钟（关联全局闹钟）/ 当日待办（独立数据） */
const CalendarPanel: FC = () => {
  const customSounds = useAppSelector((s) => s.hubSettings.customSounds)
  const alarms = useLiveQuery(async () => (await db.hub_alarms.toArray()) ?? [], [], [])
  const dayNotes = useLiveQuery(async () => (await db.hub_day_notes.toArray()) ?? [], [], [])
  const activity = useLiveQuery(async () => (await db.hub_activity.toArray()) ?? [], [], [])

  const [today] = useState(() => new Date())
  const [viewYear, setViewYear] = useState(() => today.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => today.getMonth())
  const [selected, setSelected] = useState<string>(() => toISODate(today))
  // 热力图默认收起：月历与当日详情优先保证完整可见；展开时与月历同宽对齐
  const [hmCollapsed, setHmCollapsed] = useState(true)

  // 当日闹钟输入
  const [alarmTime, setAlarmTime] = useState('09:00')
  const [alarmLabel, setAlarmLabel] = useState('')
  const [alarmSound, setAlarmSound] = useState('default')

  // 当日待办输入
  const [dayText, setDayText] = useState('')
  const [deletingDayNote, setDeletingDayNote] = useState<number | null>(null)

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth])
  const todayISO = toISODate(today)

  // 月历标记：蓝点 = 当日待办；琥珀点 = 日历闹钟
  const dayNoteDates = useMemo(() => new Set(dayNotes?.map((n) => n.date) ?? []), [dayNotes])
  const alarmDates = useMemo(() => new Set((alarms ?? []).filter((a) => a.date && a.enabled).map((a) => a.date!)), [alarms])

  // 热力图
  const activityMap = useMemo(() => new Map((activity ?? []).map((a) => [a.date, a] as const)), [activity])
  const hm = useMemo(() => {
    const { start, totalWeeks } = heatmapRange(today)
    const weeks: { iso: string; level: number; future: boolean; note: number; todo: number }[][] = []
    const cursor = new Date(start)
    for (let w = 0; w < totalWeeks; w++) {
      const week: { iso: string; level: number; future: boolean; note: number; todo: number }[] = []
      for (let d = 0; d < 7; d++) {
        const iso = toISODate(cursor)
        const rec = activityMap.get(iso)
        const score = (rec?.note ?? 0) + (rec?.todo ?? 0)
        week.push({ iso, level: hmLevel(score), future: iso > todayISO, note: rec?.note ?? 0, todo: rec?.todo ?? 0 })
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  }, [activityMap, today, todayISO])

  const totalActive = useMemo(() => (activity ?? []).reduce((sum, a) => sum + a.note + a.todo, 0), [activity])

  // ---- 当日数据 ----
  const dayAlarms = (alarms ?? []).filter((a) => a.date === selected).sort((a, b) => a.h * 3600 + a.m * 60 - (b.h * 3600 + b.m * 60))
  const selectedDayNotes = (dayNotes ?? []).filter((n) => n.date === selected).sort((a, b) => b.createdAt - a.createdAt)

  /** 铃声展示名：内置查表，自定义查自定义声音列表 */
  const soundLabel = (sound: string) => {
    if (sound.startsWith('custom:')) {
      return customSounds.find((s) => `custom:${s.id}` === sound)?.name ?? '自定义声音'
    }
    return ALARM_SOUND_OPTIONS.find((o) => o.value === sound)?.label ?? sound
  }

  const addDayAlarm = async () => {
    const [h, m] = alarmTime.split(':').map((x) => parseInt(x, 10) || 0)
    await db.hub_alarms.add({
      h: Math.min(Math.max(h, 0), 23),
      m: Math.min(Math.max(m, 0), 59),
      s: 0,
      enabled: true,
      triggered: false,
      label: alarmLabel.trim(),
      sound: alarmSound,
      date: selected
    })
    setAlarmLabel('')
  }

  const saveDayNote = async () => {
    const text = dayText.trim()
    if (!text) return
    await db.hub_day_notes.add({ date: selected, content: text, createdAt: Date.now() })
    setDayText('')
  }

  const prevMonth = () => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1)
        return 11
      }
      return m - 1
    })
  }
  const nextMonth = () => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1)
        return 0
      }
      return m + 1
    })
  }
  const goToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelected(todayISO)
  }

  const selectedDateObj = new Date(`${selected}T00:00:00`)
  const weekday = WEEKDAYS[selectedDateObj.getDay()]

  return (
    <Panel data-no-dnd>
      {/* 月历：紧凑固定行高，不再抢占高度挤压下方区域 */}
      <MonthHeader>
        <NavBtn onClick={prevMonth} title="上个月">
          <ChevronLeft size={15} />
        </NavBtn>
        <MonthTitle>{`${viewYear}年${viewMonth + 1}月`}</MonthTitle>
        <NavBtn onClick={nextMonth} title="下个月">
          <ChevronRight size={15} />
        </NavBtn>
        <TodayBtn onClick={goToday}>今天</TodayBtn>
      </MonthHeader>
      <WeekdayRow>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </WeekdayRow>
      <Grid>
        {cells.map((c) => (
          <Cell
            key={c.iso}
            className={`${c.otherMonth ? 'other' : ''} ${c.iso === todayISO ? 'today' : ''} ${c.iso === selected ? 'selected' : ''}`}
            onClick={() => setSelected(c.iso)}>
            <span>{c.day}</span>
            <Dots>
              {dayNoteDates.has(c.iso) && <Dot className="note" />}
              {alarmDates.has(c.iso) && <Dot className="alarm" />}
            </Dots>
          </Cell>
        ))}
      </Grid>

      {/* 热力图：位于月历正下方，宽度与月历一致左对齐 */}
      <HmSection>
        <HmHeader>
          <HmTitle>
            <Flame size={13} /> 活跃度
          </HmTitle>
          <HmSummary>近一年共 {totalActive} 次</HmSummary>
          <HmLines>
            <span>少</span>
            {HM_LEVEL_COLORS.map((c) => (
              <HmCell key={c} style={{ background: c }} />
            ))}
            <span>多</span>
          </HmLines>
          <CollapseBtn onClick={() => setHmCollapsed(!hmCollapsed)}>{hmCollapsed ? '展开' : '收起'}</CollapseBtn>
        </HmHeader>
        {!hmCollapsed && (
          <HmScroll>
            {hm.map((week, wi) => (
              <HmWeek key={wi}>
                {week.map((cell) => (
                  <HmCell
                    key={cell.iso}
                    className={cell.future ? 'future' : ''}
                    style={{ background: cell.future ? 'transparent' : HM_LEVEL_COLORS[cell.level] }}
                    title={cell.future ? cell.iso : `${cell.iso}：完成 ${cell.todo} 个待办，编辑 ${cell.note} 次便签`}
                  />
                ))}
              </HmWeek>
            ))}
          </HmScroll>
        )}
      </HmSection>

      {/* 当日详情：占剩余空间 */}
      <DetailRow>
        <DetailLeft>
          <DetailTitle>
            <Bell size={12} /> {selected}（周{weekday}）闹钟
          </DetailTitle>
          <InputRow>
            <TimeInput type="time" value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)} />
            <TextInput placeholder="标签" maxLength={50} value={alarmLabel} onChange={(e) => setAlarmLabel(e.target.value)} />
            <SoundWrap>
              <SoundPicker value={alarmSound} onChange={setAlarmSound} />
            </SoundWrap>
            <SmallAdd onClick={() => void addDayAlarm()}>
              <Plus size={11} /> 闹钟
            </SmallAdd>
          </InputRow>
          <DetailList>
            {dayAlarms.length === 0 ? (
              <DetailEmpty>这一天还没有闹钟</DetailEmpty>
            ) : (
              dayAlarms.map((a: HubAlarm) => (
                <DetailItem key={a.id}>
                  <span className="time">{`${String(a.h).padStart(2, '0')}:${String(a.m).padStart(2, '0')}`}</span>
                  <span className="label">{a.label || '闹钟'}</span>
                  <span className="meta">{soundLabel(a.sound)}</span>
                  <Del onClick={() => a.id != null && void db.hub_alarms.delete(a.id)}>✕</Del>
                </DetailItem>
              ))
            )}
          </DetailList>
        </DetailLeft>
        <DetailRight>
          <DetailTitle>
            <CalendarDays size={12} /> 当日待办
          </DetailTitle>
          <DayNoteInput
            rows={2}
            placeholder="为这天写点什么…（Ctrl+Enter 保存）"
            value={dayText}
            onChange={(e) => setDayText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void saveDayNote()
            }}
          />
          <SmallAdd onClick={() => void saveDayNote()} disabled={!dayText.trim()} style={{ alignSelf: 'flex-end' }}>
            保存
          </SmallAdd>
          <DetailList>
            {selectedDayNotes.length === 0 ? (
              <DetailEmpty>还没有记录</DetailEmpty>
            ) : (
              selectedDayNotes.map((n) => (
                <DetailItem key={n.id}>
                  <span className="label wide">{n.content.replace(/\s+/g, ' ').slice(0, 40)}</span>
                  <Del onClick={() => n.id != null && setDeletingDayNote(n.id)}>✕</Del>
                </DetailItem>
              ))
            )}
          </DetailList>
        </DetailRight>
      </DetailRow>

      <MXDialog
        open={deletingDayNote != null}
        title="删除这条当日待办？"
        okText="删除"
        danger
        onCancel={() => setDeletingDayNote(null)}
        onOk={() => {
          if (deletingDayNote != null) void db.hub_day_notes.delete(deletingDayNote)
          setDeletingDayNote(null)
        }}>
        删除后将无法恢复。
      </MXDialog>
    </Panel>
  )
}

const Panel = styled.div`
  grid-area: calendar;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  padding: 12px 14px;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 16px;
  box-shadow: ${mx.shadow};
  overflow: hidden;
`

const HmSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
`

const HmHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
`

const HmTitle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: ${mx.text};
`

const HmSummary = styled.span`
  flex: 1;
  font-size: 10.5px;
  color: ${mx.text3};
`

const HmLines = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: ${mx.text3};
`

const CollapseBtn = styled.button`
  border: 1px solid ${mx.border};
  border-radius: 999px;
  background: none;
  font-size: 10.5px;
  color: ${mx.text2};
  padding: 2px 10px;
  cursor: pointer;
  &:hover {
    border-color: ${mx.accent};
    color: ${mx.accent};
  }
`

const HmScroll = styled.div`
  display: flex;
  gap: 2px;
  width: 100%;
  overflow-x: auto;
  padding-bottom: 2px;
  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 2px;
  }
`

const HmWeek = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
`

const HmCell = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
  transition: transform 0.12s ease;
  &:hover {
    transform: scale(1.5);
  }
`

const MonthHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const MonthTitle = styled.span`
  font-size: 13.5px;
  font-weight: 700;
  color: ${mx.text};
  min-width: 84px;
  text-align: center;
`

const NavBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid ${mx.border};
  border-radius: 8px;
  background: none;
  color: ${mx.text2};
  cursor: pointer;
  &:hover {
    border-color: ${mx.accent};
    color: ${mx.accent};
  }
`

const TodayBtn = styled.button`
  margin-left: auto;
  border: 1px solid ${mx.accent};
  border-radius: 999px;
  background: ${mx.accentSoft};
  color: ${mx.accent};
  font-size: 11px;
  padding: 2px 12px;
  cursor: pointer;
`

const WeekdayRow = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  font-size: 10.5px;
  color: ${mx.text3};
  text-align: center;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 22px);
  gap: 2px;
  flex-shrink: 0;
`

const Cell = styled.button`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: none;
  border-radius: 7px;
  background: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: ${mx.text};
  cursor: pointer;
  transition: background 0.15s ease;
  padding: 0;
  &:hover {
    background: ${mx.soft};
  }
  &.other {
    opacity: 0.32;
  }
  &.today {
    border: 1px solid ${mx.accent};
    color: ${mx.accent};
    font-weight: 700;
  }
  &.selected {
    background: ${mx.accentSoft};
  }
`

const Dots = styled.span`
  display: flex;
  gap: 3px;
  height: 4px;
`

const Dot = styled.span`
  width: 4px;
  height: 4px;
  border-radius: 50%;
  &.note {
    background: #3B82F6;
  }
  &.alarm {
    background: ${mx.amber};
  }
`

const DetailRow = styled.div`
  display: flex;
  gap: 10px;
  flex: 1;
  min-height: 0;
  border-top: 1px dashed ${mx.border};
  padding-top: 6px;
  overflow-y: auto;
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
`

const DetailLeft = styled.div`
  flex: 6;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const DetailRight = styled.div`
  flex: 4;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const DetailTitle = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: ${mx.text2};
`

const InputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
`

const SoundWrap = styled.div`
  min-width: 120px;
  max-width: 170px;
  flex: 1;
`

const TimeInput = styled.input`
  border: 1px solid ${mx.border};
  border-radius: 8px;
  padding: 4px 6px;
  font-size: 11.5px;
  color: ${mx.text};
  background: ${mx.soft2};
  outline: none;
  &:focus {
    border-color: ${mx.accent};
  }
`

const TextInput = styled.input`
  flex: 1;
  min-width: 50px;
  border: 1px solid ${mx.border};
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11.5px;
  color: ${mx.text};
  background: ${mx.soft2};
  outline: none;
  &:focus {
    border-color: ${mx.accent};
  }
`

const SmallAdd = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: ${mx.gradient};
  cursor: pointer;
  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

const DayNoteInput = styled.textarea`
  border: 1px solid ${mx.border};
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 11.5px;
  line-height: 1.5;
  color: ${mx.text};
  background: ${mx.soft2};
  outline: none;
  resize: none;
  font-family: inherit;
  &:focus {
    border-color: ${mx.accent};
  }
`

const DetailList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${mx.border};
    border-radius: 3px;
  }
`

const DetailEmpty = styled.div`
  font-size: 10.5px;
  color: ${mx.text3};
  padding: 6px 2px;
`

const DetailItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 8px;
  font-size: 11.5px;
  &:hover {
    background: ${mx.soft};
  }
  .time {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: ${mx.accent};
  }
  .label {
    flex: 1;
    min-width: 0;
    color: ${mx.text};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label.wide {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .meta {
    font-size: 10px;
    color: ${mx.text3};
    flex-shrink: 0;
  }
`

const Del = styled.button`
  border: none;
  background: none;
  color: ${mx.text3};
  font-size: 11px;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  &:hover {
    color: ${mx.danger};
    background: rgba(239, 83, 80, 0.08);
  }
`

export default CalendarPanel
