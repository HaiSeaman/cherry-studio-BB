import { type FC, useMemo } from 'react'
import styled from 'styled-components'

import { toISODate, WEEK_DAYS_CN } from '../services/calendar'
import type { HabitDateSets } from '../services/stats'
import { currentStreak, longestStreak, strengthIndex, weekdayDistribution } from '../services/stats'
import type { Habit } from '../types'
import { mx } from './mx'

/**
 * 单习惯详情：当前连续 / 最长连续 / 总打卡 / 强度指数 + 星期分布柱状图
 * 口径全部出自 stats.ts
 */
const HabitDetail: FC<{ habit: Habit; today: string; allRecords: Map<string, HabitDateSets> }> = ({
  habit,
  today,
  allRecords
}) => {
  const data = useMemo(() => {
    const sets = allRecords.get(habit.id) ?? { done: new Set<string>(), skip: new Set<string>() }
    const createdISO = toISODate(new Date(habit.createdAt))
    const dist = weekdayDistribution([...sets.done], sets.skip, createdISO, today)
    const maxDist = Math.max(...dist, 1)
    return {
      cur: currentStreak(sets.done, sets.skip, createdISO, today),
      longest: longestStreak(sets.done, sets.skip, createdISO, today),
      total: sets.done.size,
      strength: strengthIndex(sets.done, sets.skip, createdISO, today),
      dist,
      maxDist
    }
  }, [habit, allRecords, today])

  return (
    <Wrap>
      <HabitHead>
        <span className="emoji">{habit.icon}</span>
        <span className="name">{habit.name}</span>
        <ColorDot $color={habit.color} />
      </HabitHead>
      {/* 备注是可选字段：老数据/未填写时整行不渲染，不留空壳 */}
      {habit.note?.trim() && <NoteLine $color={habit.color}>{habit.note.trim()}</NoteLine>}

      <MetricRow>
        <Metric>
          <div className="value">{data.cur}</div>
          <div className="label">当前连续（天）</div>
        </Metric>
        <Metric>
          <div className="value">{data.longest}</div>
          <div className="label">最长连续（天）</div>
        </Metric>
        <Metric>
          <div className="value">{data.total}</div>
          <div className="label">总打卡（次）</div>
        </Metric>
        <Metric>
          <div className="value">{data.strength}</div>
          <div className="label">强度指数（0~100）</div>
        </Metric>
      </MetricRow>

      <SectionTitle>星期分布（薄弱日一眼看到）</SectionTitle>
      <WeekChart>
        <Baseline />
        {data.dist.map((v, i) => (
          <BarCol key={i}>
            <BarWrap>
              <BarFill $color={habit.color} $h={Math.max((v / data.maxDist) * 100, 2)} />
            </BarWrap>
            <BarPct>{v}%</BarPct>
            <BarLabel>{WEEK_DAYS_CN[i]}</BarLabel>
          </BarCol>
        ))}
      </WeekChart>
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`

const HabitHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  .emoji {
    font-size: 22px;
  }
  .name {
    font-size: 17px;
    font-weight: 700;
    color: ${mx.text};
  }
`

const ColorDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => p.$color};
`

/** 备注行：习惯主题色左边条的引用式卡片（与表单预览同一设计语言） */
const NoteLine = styled.div<{ $color: string }>`
  padding: 8px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, ${(p) => p.$color} 8%, transparent);
  border-left: 3px solid ${(p) => p.$color};
  font-size: 12.5px;
  line-height: 1.5;
  color: ${mx.text2};
  word-break: break-word;
`

const MetricRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
`

const Metric = styled.div`
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 14px;
  padding: 12px 16px;
  min-width: 0;
  .value {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.15;
    color: ${mx.text};
    font-variant-numeric: tabular-nums;
  }
  .label {
    margin-top: 3px;
    font-size: 11px;
    letter-spacing: 0.03em;
    color: ${mx.text3};
  }
`

const SectionTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: ${mx.text3};
`

const WeekChart = styled.div`
  position: relative;
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 14px;
  padding: 14px 16px 12px;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 10px;
  align-items: end;
`

/* 100% 基准虚线：与柱形区顶对齐（padding-top 14px 处） */
const Baseline = styled.div`
  position: absolute;
  top: 14px;
  left: 16px;
  right: 16px;
  height: 0;
  border-top: 1px dashed ${mx.border};
`

const BarCol = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`

const BarWrap = styled.div`
  height: 90px;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
`

const BarFill = styled.div<{ $color: string; $h: number }>`
  width: 60%;
  border-radius: 6px 6px 2px 2px;
  background: ${(p) => p.$color};
  height: ${(p) => p.$h}%;
  opacity: 0.85;
`

const BarPct = styled.div`
  font-size: 11px;
  color: ${mx.text2};
  font-variant-numeric: tabular-nums;
`

const BarLabel = styled.div`
  font-size: 11px;
  color: ${mx.text3};
`

export default HabitDetail
