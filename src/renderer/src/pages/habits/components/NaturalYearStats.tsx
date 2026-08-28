import { type FC, useMemo, useState } from 'react'
import styled from 'styled-components'

import { toISODate } from '../services/calendar'
import type { HabitDateSets } from '../services/stats'
import { type HeatCellState, yearlyCheckinStats, yearlyHeatCells } from '../services/stats'
import type { Habit } from '../types'
import HeatmapGrid, { type HeatGridCell } from './HeatmapGrid'
import { mx } from './mx'

interface Props {
  habits: Habit[]
  allRecords: Map<string, HabitDateSets>
  today: string
}

/** 空记录兜底：模块级单例（每次渲染新建对象会让依赖 sets 的 useMemo 全部失效） */
const EMPTY_SETS: HabitDateSets = { done: new Set<string>(), skip: new Set<string>() }

const STATE_LABEL: Record<HeatCellState, string> = {
  done: '已打卡',
  skip: '已跳过',
  none: '未打卡',
  future: '未来'
}

/** '2026-08-02' → '8月2日' */
function formatMD(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(m)}月${Number(d)}日`
}

/** 单习惯自然年统计：名字栏（标题+年份切换+习惯chips+计数）+ 该习惯整年打卡热力图 */
const NaturalYearStats: FC<Props> = ({ habits, allRecords, today }) => {
  const sorted = useMemo(() => [...habits].sort((a, b) => a.order - b.order), [habits])
  const currentYear = Number(today.slice(0, 4))
  const minYear = useMemo(() => {
    const years = sorted.map((h) => new Date(h.createdAt).getFullYear())
    return years.length > 0 ? Math.min(...years) : currentYear
  }, [sorted, currentYear])

  const [year, setYear] = useState(currentYear)
  const [selectedId, setSelectedId] = useState<string>(sorted[0]?.id ?? '')

  // ---- 以下 hooks 全部无条件调用（Rules of Hooks：不得在条件 return 之后调用）----
  const habit = sorted.find((h) => h.id === selectedId) ?? sorted[0]
  const sets = allRecords.get(habit?.id ?? '') ?? EMPTY_SETS
  const createdISO = toISODate(new Date(habit?.createdAt ?? Date.now()))

  // 366 格热力图构建成本虽低，但该组件随 useLiveQuery/30s 跨午夜刷新频繁重渲染——memo 化避免每帧重建
  const stats = useMemo(
    () => yearlyCheckinStats(sets.done, sets.skip, createdISO, year, today),
    [sets, createdISO, year, today]
  )
  const heat = useMemo(() => yearlyHeatCells(sets.done, sets.skip, year, today), [sets, year, today])
  const cells: HeatGridCell[] = useMemo(
    () =>
      habit
        ? heat.cells.map((c) => {
            const isToday = c.date === today
            const background = c.state === 'done' ? habit.color : c.state === 'skip' ? habit.color : mx.soft
            const opacity = c.state === 'skip' ? 0.22 : 1
            const outline = isToday ? `1px solid ${mx.text2}` : undefined
            return {
              key: c.date,
              date: c.date,
              week: c.week,
              dow: c.dow,
              title: `${formatMD(c.date)} · ${STATE_LABEL[c.state]}`,
              background,
              opacity,
              outline
            }
          })
        : [],
    [habit, heat, today]
  )

  if (sorted.length === 0) return null

  const legend = (
    <>
      <LegendItem $bg={habit.color} $opacity={1} />
      <span>打卡</span>
      <LegendItem $bg={habit.color} $opacity={0.22} />
      <span>跳过</span>
      <LegendItem $bg={mx.soft} $opacity={1} />
      <span>未打卡</span>
    </>
  )

  return (
    <Wrap>
      <NameBar>
        <NameLeft>
          <Title>自然年统计</Title>
          <YearSwitcher>
            <YearBtn type="button" onClick={() => setYear((y) => y - 1)} disabled={year <= minYear} aria-label="上一年">
              ‹
            </YearBtn>
            <YearText>{year}年</YearText>
            <YearBtn
              type="button"
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= currentYear}
              aria-label="下一年">
              ›
            </YearBtn>
          </YearSwitcher>
        </NameLeft>
        <Count>
          共打卡 <b>{stats.done}</b> 天
        </Count>
      </NameBar>
      <Chips>
        {sorted.map((h) => (
          <Chip
            key={h.id}
            type="button"
            data-chip={h.id}
            className={h.id === habit.id ? 'active' : ''}
            onClick={() => setSelectedId(h.id)}>
            <span>{h.icon}</span>
            {h.name}
          </Chip>
        ))}
      </Chips>
      <ChartCard>
        <HeatmapGrid cols={heat.cols} cells={cells} labels={heat.labels} legend={legend} />
      </ChartCard>
      {stats.elapsedDays > 0 && (
        <Meta>
          完成率 {stats.rate}% · 已过 {stats.elapsedDays} 天（跳过 {stats.skipCount} 天不计）
        </Meta>
      )}
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const NameBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  flex-wrap: wrap;
`

const NameLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const Title = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: ${mx.text3};
`

const YearSwitcher = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
`

const YearBtn = styled.button`
  border: none;
  background: transparent;
  color: ${mx.text3};
  font-size: 14px;
  padding: 0 6px;
  cursor: pointer;
  border-radius: 6px;
  &:hover:not(:disabled) {
    color: ${mx.text};
    background: ${mx.soft};
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`

const YearText = styled.span`
  font-size: 13px;
  color: ${mx.text};
  font-variant-numeric: tabular-nums;
  min-width: 52px;
  text-align: center;
`

const Chips = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
`

const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid ${mx.border};
  background: ${mx.card};
  color: ${mx.text2};
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  cursor: pointer;
  &:hover {
    color: ${mx.text};
  }
  &.active {
    color: ${mx.text};
    border-color: ${mx.accent};
    background: ${mx.accentSoft};
  }
`

const Count = styled.div`
  font-size: 12.5px;
  color: ${mx.text3};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  b {
    color: ${mx.text};
    font-size: 15px;
    font-weight: 700;
    margin: 0 1px;
  }
`

const ChartCard = styled.div`
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 14px;
  padding: 14px 16px;
`

const Meta = styled.div`
  font-size: 11.5px;
  color: ${mx.text3};
  font-variant-numeric: tabular-nums;
`

const LegendItem = styled.span<{ $bg: string; $opacity: number }>`
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: ${(p) => p.$bg};
  opacity: ${(p) => p.$opacity};
`

export default NaturalYearStats
