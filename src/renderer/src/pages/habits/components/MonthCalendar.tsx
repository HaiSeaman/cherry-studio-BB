import { Button, Dropdown, notification } from 'antd'
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react'
import { type FC, useMemo, useState } from 'react'
import styled from 'styled-components'

import { useActiveHabits, useAllRecords, useMonthRecords } from '../hooks/useHabits'
import { addMonths, monthDays, monthTitle, toISODate, weekdayOf } from '../services/calendar'
import { restoreRecord, setSkip, toggleRecord } from '../services/habitService'
import { currentStreak, longestStreak } from '../services/stats'
import type { Habit, HabitRecord } from '../types'
import { mx } from './mx'

/**
 * B 风格月历：每习惯一行，整月格子从左到右横向展开
 * 格子状态（spec 4.2）：done 习惯色浅底 / skip 灰底"-" / 今天(已打)实底深描边 /
 * 今天(未打)习惯色虚线描边 / 漏卡柔和警示虚线 / 未来空白不可点
 * 视觉签名：今天列整列浅色竖带，一眼锁定今天
 */
const MonthCalendar: FC<{ today: string; onOpenDetail: (habit: Habit) => void }> = ({ today, onOpenDetail }) => {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)

  const habits = useActiveHabits()
  const { byHabit } = useMonthRecords(viewYear, viewMonth)
  const allRecords = useAllRecords()

  const days = useMemo(() => monthDays(viewYear, viewMonth, today), [viewYear, viewMonth, today])

  const shift = (delta: number) => {
    const next = addMonths(viewYear, viewMonth, delta)
    setViewYear(next.year)
    setViewMonth(next.month)
  }

  const backToToday = () => {
    const t = new Date()
    setViewYear(t.getFullYear())
    setViewMonth(t.getMonth() + 1)
  }

  const onClickCell = async (habit: Habit, date: string, prev: HabitRecord | null) => {
    const result = await toggleRecord(habit.id, date)
    if (result === 'removed') {
      const key = `habit-undo-${habit.id}-${date}`
      notification.open({
        key,
        message: '已取消打卡',
        description: `「${habit.name}」 ${date}`,
        duration: 5,
        placement: 'bottomRight',
        btn: (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              void restoreRecord(habit.id, date, prev)
              notification.destroy(key)
            }}>
            撤销
          </Button>
        )
      })
    }
  }

  const onToggleSkip = (habit: Habit, date: string, skipped: boolean) => {
    void setSkip(habit.id, date, skipped)
  }

  return (
    <Wrap>
      <Toolbar>
        <NavBtn onClick={() => shift(-1)} aria-label="上一月">
          <ChevronLeft size={16} />
        </NavBtn>
        <MonthLabel>{monthTitle(viewYear, viewMonth)}</MonthLabel>
        <NavBtn onClick={() => shift(1)} aria-label="下一月">
          <ChevronRight size={16} />
        </NavBtn>
        <TodayBtn onClick={backToToday}>回到今天</TodayBtn>
      </Toolbar>

      <ScrollArea>
        <Grid $rows={Math.max(habits.length, 1)} $rowMax={habits.length <= 4 ? 88 : habits.length <= 7 ? 72 : 60}>
          {/* 表头行：习惯名列占位 + 日期 1~31（周末微灰）+ 连续列 */}
          <HeaderCell $nameCol />
          {days.map((d) => (
            <HeaderCell
              key={d.date}
              $isToday={d.isToday}
              $isWeekend={weekdayOf(d.date) === 0 || weekdayOf(d.date) === 6}>
              {d.day}
            </HeaderCell>
          ))}
          <HeaderCell $streakCol>连续</HeaderCell>

          {habits.map((habit) => {
            const monthRecords = byHabit.get(habit.id) ?? []
            const monthMap = new Map<string, HabitRecord>(monthRecords.map((r) => [r.date, r]))
            const sets = allRecords.get(habit.id) ?? { done: new Set<string>(), skip: new Set<string>() }
            const createdISO = toISODate(new Date(habit.createdAt))
            const cur = currentStreak(sets.done, sets.skip, createdISO, today)
            const longest = longestStreak(sets.done, sets.skip, createdISO, today)
            return (
              <Row key={habit.id}>
                <NameCell onClick={() => onOpenDetail(habit)} title="查看详情">
                  <ColorChip $color={habit.color} />
                  <span className="emoji">{habit.icon}</span>
                  <span className="name">{habit.name}</span>
                </NameCell>
                {days.map((d) => {
                  const record = monthMap.get(d.date)
                  const isDone = record?.status === 'done'
                  const isSkip = record?.status === 'skip'
                  const status: 'done' | 'skip' | 'todayDone' | 'todayEmpty' | 'missed' | 'future' = isDone
                    ? d.isToday
                      ? 'todayDone'
                      : 'done'
                    : isSkip
                      ? 'skip'
                      : d.isFuture
                        ? 'future'
                        : d.isToday
                          ? 'todayEmpty'
                          : 'missed'
                  const menu = {
                    items: [
                      isSkip ? { key: 'unskip', label: '取消跳过' } : { key: 'skip', label: '标记跳过（不断卡）' }
                    ],
                    onClick: ({ key }: { key: string }) => {
                      if (key === 'skip') onToggleSkip(habit, d.date, true)
                      if (key === 'unskip') onToggleSkip(habit, d.date, false)
                    }
                  }
                  return (
                    <Dropdown key={d.date} menu={menu} trigger={['contextMenu']} disabled={d.isFuture}>
                      <Cell
                        $color={habit.color}
                        $status={status}
                        $todayCol={d.isToday}
                        disabled={d.isFuture}
                        title={d.isFuture ? '' : `${habit.name} · ${d.date}${isSkip ? '（跳过）' : ''}`}
                        onClick={() => void onClickCell(habit, d.date, record ?? null)}
                        aria-label={`${habit.name} ${d.date}`}>
                        {isSkip ? '-' : ''}
                      </Cell>
                    </Dropdown>
                  )
                })}
                <StreakCell $lit={cur > 0}>
                  <Flame size={13} className="flame" />
                  <span className="cur">{cur}</span>
                  <span className="sep">/</span>
                  <span className="long" title="最长连续">
                    {longest}
                  </span>
                </StreakCell>
              </Row>
            )
          })}
        </Grid>
      </ScrollArea>

      <Legend>
        <LegendItem>
          <Swatch $done /> 已打卡
        </LegendItem>
        <LegendItem>
          <Swatch $skip>-</Swatch> 跳过
        </LegendItem>
        <LegendItem>
          <Swatch $missed />
          漏卡
        </LegendItem>
        <LegendItem>
          <Swatch $today />
          今天
        </LegendItem>
        <LegendTip>左键打卡/取消 · 右键标记跳过 · 点习惯名看详情</LegendTip>
      </Legend>
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
  min-height: 0;
`

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const NavBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid ${mx.border};
  background: transparent;
  color: ${mx.text2};
  cursor: pointer;
  &:hover {
    color: ${mx.accent};
    border-color: ${mx.accent};
  }
`

const MonthLabel = styled.div`
  min-width: 110px;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: ${mx.text};
  font-variant-numeric: tabular-nums;
`

const TodayBtn = styled.button`
  border: none;
  background: transparent;
  color: ${mx.accent};
  font-size: 13px;
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
`

const ScrollArea = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
`

/*
 * 弹性网格（参考 CSS-Tricks minmax+1fr 方案）：
 * - 列：名称固定 180px，31 个日期格 minmax(20px, 1fr) 均分剩余全部宽度（最大化时铺满、不变形）
 * - 行：表头 auto，习惯行 minmax(26px, min(1fr, 行高上限)) 弹性铺满剩余高度（上限随习惯数分段）
 * - 窗口过窄时列收缩到 20px 下限后出横向滚动
 */
const Grid = styled.div<{ $rows: number; $rowMax: number }>`
  display: grid;
  grid-template-columns: 180px repeat(31, minmax(20px, 1fr)) 76px;
  grid-template-rows: auto repeat(${(p) => p.$rows}, minmax(26px, min(1fr, ${(p) => p.$rowMax}px)));
  gap: 4px;
  align-items: stretch;
  width: 100%;
  height: 100%;
  flex: 1;
`

const HeaderCell = styled.div<{ $nameCol?: boolean; $streakCol?: boolean; $isToday?: boolean; $isWeekend?: boolean }>`
  font-size: clamp(11px, 1vw, 15px);
  font-variant-numeric: tabular-nums;
  text-align: center;
  align-self: end;
  padding-bottom: 2px;
  border-radius: 6px 6px 0 0;
  color: ${(p) => (p.$isToday ? mx.accent : p.$isWeekend ? mx.text3 : mx.text2)};
  ${(p) => p.$nameCol && 'text-align: left;'}
  ${(p) =>
    p.$streakCol &&
    `
    text-align: center;
    font-weight: 600;
    color: ${mx.text2};
  `}
  ${(p) => p.$isToday && 'font-weight: 700;'}
`

const Row = styled.div`
  display: contents;
`

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 4px;
  height: 100%;
  max-height: 72px;
  align-self: center;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  color: ${mx.text};
  white-space: nowrap;
  overflow: hidden;
  &:hover {
    background: ${mx.soft};
    .name {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .emoji {
    font-size: 18px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const ColorChip = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  flex-shrink: 0;
`

const Cell = styled.button<{ $color: string; $status: string; $todayCol?: boolean }>`
  width: 100%;
  height: min(100%, 56px);
  align-self: center;
  border-radius: 8px;
  padding: 0;
  font-size: clamp(11px, 0.9vw, 15px);
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${mx.text3};
  background: transparent;
  border: 1px solid transparent;
  transition:
    transform 0.12s ease,
    background-color 0.15s ease,
    border-color 0.15s ease;
  /* 今天列整列浅色竖带（视觉签名：一眼锁定今天） */
  ${(p) => p.$todayCol && `background: color-mix(in srgb, ${mx.accent} 8%, transparent);`}
  &:not(:disabled):hover {
    transform: scale(1.08);
    z-index: 1;
    position: relative;
  }
  ${(p) => {
    switch (p.$status) {
      case 'done':
        return `background: color-mix(in srgb, ${p.$color} 30%, transparent); border-color: transparent;`
      case 'todayDone':
        return `background: ${p.$color}; border: 1.5px solid ${mx.text};`
      case 'todayEmpty':
        return `border: 1.5px dashed ${p.$color}; background: color-mix(in srgb, ${mx.accent} 8%, transparent);`
      case 'skip':
        return `background: ${mx.soft2}; color: ${mx.text2}; font-weight: 700;`
      case 'missed':
        // 柔和警示：低饱和虚线，警告但不恐吓
        return `border: 1.5px dashed color-mix(in srgb, ${mx.danger} 55%, transparent);`
      default:
        return 'cursor: default;'
    }
  }}
`

const StreakCell = styled.div<{ $lit?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  max-height: 72px;
  align-self: center;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  .flame {
    color: ${(p) => (p.$lit ? mx.danger : mx.border)};
    opacity: ${(p) => (p.$lit ? 1 : 0.4)};
  }
  .cur {
    color: ${(p) => (p.$lit ? mx.text : mx.text3)};
    font-weight: 700;
  }
  .sep {
    color: ${mx.text3};
  }
  .long {
    color: ${mx.text3};
    font-size: 12px;
  }
`

const Legend = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12px;
  color: ${mx.text3};
`

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
`

const Swatch = styled.span<{ $done?: boolean; $skip?: boolean; $missed?: boolean; $today?: boolean }>`
  width: 14px;
  height: 14px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: ${mx.text2};
  ${(p) => {
    if (p.$done) return `background: color-mix(in srgb, ${mx.accent} 30%, transparent);`
    if (p.$skip) return `background: ${mx.soft2}; font-weight: 700;`
    if (p.$missed) return `border: 1.5px dashed color-mix(in srgb, ${mx.danger} 55%, transparent);`
    if (p.$today) return `background: color-mix(in srgb, ${mx.accent} 8%, transparent); border: 1px solid color-mix(in srgb, ${mx.accent} 45%, transparent);`
    return ''
  }}
`

const LegendTip = styled.span`
  margin-left: auto;
`

export default MonthCalendar
