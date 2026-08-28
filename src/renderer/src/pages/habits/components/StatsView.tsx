import { type FC, useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import { addDaysISO, toISODate } from '../services/calendar'
import type { HabitDateSets } from '../services/stats'
import { completionRate, strengthIndex } from '../services/stats'
import type { Habit } from '../types'
import { EmptyText, mx, MXTabs } from './mx'
import NaturalYearStats from './NaturalYearStats'

type RangeKey = '30' | '90' | '365'

/**
 * 统计视图：每日完成率趋势（30/90/365）+ 各习惯完成率对比条（按强度排序）+ 自然年统计
 */
const StatsView: FC<{ habits: Habit[]; allRecords: Map<string, HabitDateSets>; today: string }> = ({
  habits,
  allRecords,
  today
}) => {
  const [range, setRange] = useState<RangeKey>('30')

  // 单日「当日完成率」：当日应打（已创建且未跳过）习惯中被完成的占比
  const dayRatio = useCallback(
    (d: string, createdISOs: string[]): number => {
      let due = 0
      let done = 0
      habits.forEach((habit, i) => {
        if (createdISOs[i] > d) return
        const sets = allRecords.get(habit.id)
        if (!sets) {
          due++
          return
        }
        if (sets.skip.has(d)) return
        due++
        if (sets.done.has(d)) done++
      })
      return due === 0 ? 0 : done / due
    },
    [habits, allRecords]
  )

  // 每日「当日完成率」序列：done 的活跃习惯数 / 当日应打习惯数（已创建且未跳过）
  const daily = useMemo(() => {
    const n = Number(range)
    const start = addDaysISO(today, -(n - 1))
    const createdISOs = habits.map((h) => toISODate(new Date(h.createdAt)))
    const days: { date: string; ratio: number }[] = []
    for (let d = start; d <= today; d = addDaysISO(d, 1)) {
      days.push({ date: d, ratio: dayRatio(d, createdISOs) })
    }
    return days
  }, [habits, today, range, dayRatio])

  // 各习惯：全程完成率 + 强度指数（按强度降序）
  const ranked = useMemo(() => {
    return habits
      .map((habit) => {
        const sets = allRecords.get(habit.id) ?? { done: new Set<string>(), skip: new Set<string>() }
        const createdISO = toISODate(new Date(habit.createdAt))
        return {
          habit,
          rate: completionRate(sets.done.size, sets.skip.size, createdISO, today),
          strength: strengthIndex(sets.done, sets.skip, createdISO, today)
        }
      })
      .sort((a, b) => b.strength - a.strength)
  }, [habits, allRecords, today])

  // SVG 折线坐标（viewBox 0~100，preserveAspectRatio=none 拉伸铺满）
  const W = 100
  const H = 100
  const pt = (i: number, ratio: number): string =>
    `${daily.length === 1 ? W / 2 : (i / (daily.length - 1)) * W},${(1 - ratio) * H}`
  const points = daily.map((d, i) => pt(i, d.ratio)).join(' ')
  const area = daily.length > 0 ? `${pt(0, daily[0].ratio)} ${points} ${W},${H} 0,${H}` : ''
  const last = daily[daily.length - 1]

  return (
    <Wrap>
      <Section>
        <SectionHead>
          <SectionTitle>每日完成率趋势</SectionTitle>
          <MXTabs<RangeKey>
            value={range}
            onChange={setRange}
            size="sm"
            options={[
              { value: '30', label: '30天' },
              { value: '90', label: '90天' },
              { value: '365', label: '全年' }
            ]}
          />
        </SectionHead>
        <ChartCard>
          {daily.length > 0 ? (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={mx.accent} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={mx.accent} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {/* 参考线：25/50/75/100 */}
                {[25, 50, 75].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    x2={W}
                    y1={100 - y}
                    y2={100 - y}
                    stroke={mx.border}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray="3 4"
                  />
                ))}
                <polygon points={area} fill="url(#trend-fill)" />
                <polyline
                  points={points}
                  fill="none"
                  stroke={mx.accent}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {last && (
                <TrendTip>
                  {last.date.slice(5).replace('-', '/')} 完成率 <b>{Math.round(last.ratio * 100)}%</b>
                </TrendTip>
              )}
            </>
          ) : (
            <EmptyText>暂无数据</EmptyText>
          )}
        </ChartCard>
      </Section>

      <Section>
        <SectionTitle>各习惯完成率（按强度指数排序）</SectionTitle>
        <ChartCard>
          {ranked.length === 0 ? (
            <EmptyText>暂无数据</EmptyText>
          ) : (
            <BarList>
              <BarHead>
                <span>习惯</span>
                <span />
                <span>完成率</span>
                <span>强度</span>
              </BarHead>
              {ranked.map(({ habit, rate, strength }) => (
                <BarRow key={habit.id}>
                  <div className="name">
                    {habit.icon} {habit.name}
                  </div>
                  <div className="track">
                    <Fill $color={habit.color} $w={Math.min(rate, 100)} />
                  </div>
                  <div className="pct">{rate}%</div>
                  <div className="strength" title="强度指数（0~100，近期打卡权重更高）">
                    {strength}
                  </div>
                </BarRow>
              ))}
            </BarList>
          )}
        </ChartCard>
      </Section>

      <NaturalYearStats habits={habits} allRecords={allRecords} today={today} />
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`

/* 区块 = 标题 + 卡片成组，标题用小字号弱色 + 字距（eyebrow 风格） */
const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`

const SectionTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: ${mx.text3};
`

const ChartCard = styled.div`
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 14px;
  padding: 14px 16px;
  svg {
    width: 100%;
    height: 132px;
    display: block;
  }
`

const TrendTip = styled.div`
  margin-top: 8px;
  font-size: 11.5px;
  color: ${mx.text3};
  font-variant-numeric: tabular-nums;
  b {
    color: ${mx.text};
    font-weight: 600;
  }
`

const BarList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const BarHead = styled.div`
  display: grid;
  grid-template-columns: minmax(96px, 150px) 1fr 56px 44px;
  gap: 10px;
  font-size: 11px;
  color: ${mx.text3};
  letter-spacing: 0.04em;
  span:nth-child(n + 3) {
    text-align: right;
  }
`

const Fill = styled.div<{ $color: string; $w: number }>`
  height: 100%;
  border-radius: 999px;
  background: ${(p) => p.$color};
  width: ${(p) => p.$w}%;
  opacity: 0.85;
`

const BarRow = styled.div`
  display: grid;
  grid-template-columns: minmax(96px, 150px) 1fr 56px 44px;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: ${mx.text};
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    height: 10px;
    border-radius: 999px;
    background: ${mx.soft};
    overflow: hidden;
  }
  .pct {
    text-align: right;
    color: ${mx.text2};
    font-variant-numeric: tabular-nums;
  }
  .strength {
    text-align: right;
    color: ${mx.text3};
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
  }
`

export default StatsView
