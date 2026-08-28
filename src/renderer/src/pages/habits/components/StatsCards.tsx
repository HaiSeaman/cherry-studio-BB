import { type FC, useMemo } from 'react'
import styled from 'styled-components'

import { toISODate } from '../services/calendar'
import type { HabitDateSets } from '../services/stats'
import { longestStreak, overallWindowCompletionRate } from '../services/stats'
import type { Habit } from '../types'
import { mx } from './mx'

/**
 * 顶部 4 统计卡：累计打卡天数 / 今日进度 / 近30天完成率 / 最佳连续
 * 口径全部出自 stats.ts（唯一出口）
 */
const StatsCards: FC<{ habits: Habit[]; allRecords: Map<string, HabitDateSets>; today: string }> = ({
  habits,
  allRecords,
  today
}) => {
  const stats = useMemo(() => {
    const setsList: HabitDateSets[] = []
    const createdISOs: string[] = []
    let totalDone = 0
    let doneToday = 0
    let best = 0
    for (const habit of habits) {
      const sets = allRecords.get(habit.id) ?? { done: new Set<string>(), skip: new Set<string>() }
      const createdISO = toISODate(new Date(habit.createdAt))
      setsList.push(sets)
      createdISOs.push(createdISO)
      totalDone += sets.done.size
      if (sets.done.has(today)) doneToday++
      const l = longestStreak(sets.done, sets.skip, createdISO, today)
      if (l > best) best = l
    }
    return {
      totalDone,
      todayProgress: { x: doneToday, y: habits.length },
      rate30: overallWindowCompletionRate(setsList, createdISOs, today, 30),
      best
    }
  }, [habits, allRecords, today])

  return (
    <CardRow>
      <Card>
        <div className="value">{stats.totalDone}</div>
        <div className="label">累计打卡（次）</div>
      </Card>
      <Card>
        <div className="value">
          {stats.todayProgress.x}
          <span className="unit">/{stats.todayProgress.y}</span>
        </div>
        <div className="label">今日进度</div>
        <ProgressTrack>
          <ProgressFill
            $pct={stats.todayProgress.y === 0 ? 0 : (stats.todayProgress.x / stats.todayProgress.y) * 100}
          />
        </ProgressTrack>
      </Card>
      <Card>
        <div className="value">
          {stats.rate30}
          <span className="unit">%</span>
        </div>
        <div className="label">近30天完成率</div>
      </Card>
      <Card>
        <div className="value">{stats.best}</div>
        <div className="label">最佳连续（天）</div>
      </Card>
    </CardRow>
  )
}

const CardRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
`

const Card = styled.div`
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 14px;
  padding: 14px 18px;
  .value {
    font-size: 28px;
    font-weight: 700;
    color: ${mx.text};
    font-variant-numeric: tabular-nums;
    .unit {
      font-size: 14px;
      font-weight: 500;
      color: ${mx.text2};
      margin-left: 2px;
    }
  }
  .label {
    margin-top: 2px;
    font-size: 12.5px;
    color: ${mx.text3};
  }
`

const ProgressTrack = styled.div`
  margin-top: 6px;
  height: 5px;
  border-radius: 999px;
  background: ${mx.soft};
  overflow: hidden;
`

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  border-radius: 999px;
  width: ${(p) => Math.min(p.$pct, 100)}%;
  background: linear-gradient(90deg, color-mix(in srgb, ${mx.accent} 55%, transparent), ${mx.accent});
  transition: width 0.35s ease;
`

export default StatsCards
