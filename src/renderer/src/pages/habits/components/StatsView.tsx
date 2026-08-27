import { type FC, useCallback, useMemo, useState } from 'react'
import styled from 'styled-components'

import { addDaysISO, toISODate, weekdayOf } from '../services/calendar'
import type { HabitDateSets } from '../services/stats'
import { completionRate, strengthIndex } from '../services/stats'
import type { Habit } from '../types'
import { EmptyText, mx, MXTabs } from './mx'

type RangeKey = '30' | '90' | '365'

/**
 * 统计视图：每日完成率趋势折线（30/90/365）+ 各习惯完成率对比条（按强度排序）+ 年度热力图
 */
const StatsView: FC<{ habits: Habit[]; allRecords: Map<string, HabitDateSets>; today: string }> = ({
  habits,
  allRecords,
  today
}) => {
  const [range, setRange] = useState<RangeKey>('30')

  // 单日「当日完成率」：当日应打（已创建且未跳过）习惯中被完成的占比——趋势图与热力图共用同一口径
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

  // 年度热力图（365 天，列=周，GitHub 风格）：当日完成率 → 5 档
  const heat = useMemo(() => {
    const n = 365
    const start = addDaysISO(today, -(n - 1))
    const createdISOs = habits.map((h) => toISODate(new Date(h.createdAt)))
    const ratios = new Map<string, number>()
    for (let d = start; d <= today; d = addDaysISO(d, 1)) {
      ratios.set(d, dayRatio(d, createdISOs))
    }    // 对齐到周列：显式计算每个格子的（周列, 星期行）坐标，供 Grid 显式定位（不变形、严格对齐）
    const startDow = weekdayOf(start)
    const cells: { key: string; date: string; level: number; week: number; dow: number }[] = []
    const labels: { week: number; label: string }[] = []
    let lastLabelWeek = -3
    let index = startDow
    let prevMonth = -1
    for (let d = start; ; d = addDaysISO(d, 1)) {
      const r = ratios.get(d) ?? 0
      const level = r === 0 ? 0 : Math.max(1, Math.round(r * 4))
      const week = Math.floor(index / 7)
      const dow = index % 7
      cells.push({ key: d, date: d, level, week, dow })
      // 月份标签：每逢月份变化，在该月首周列顶部标注（间隔不足 2 列时跳过防重叠）
      const month = Number(d.slice(5, 7))
      if (month !== prevMonth) {
        if (week - lastLabelWeek >= 2) {
          labels.push({ week, label: `${month}月` })
          lastLabelWeek = week
        }
        prevMonth = month
      }
      index++
      if (d === today) break
    }
    const cols = Math.ceil((startDow + n) / 7)
    return { cols, cells, labels }
  }, [habits, today, dayRatio])

  const W = 100
  const H = 100
  const points = daily
    .map((d, i) => `${daily.length === 1 ? 50 : (i / (daily.length - 1)) * W},${(1 - d.ratio) * H}`)
    .join(' ')

  return (
    <Wrap>
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
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke={mx.accent} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <EmptyText>暂无数据</EmptyText>
        )}
      </ChartCard>

      <SectionTitle>各习惯完成率（按强度指数排序）</SectionTitle>
      <ChartCard>
        {ranked.length === 0 ? (
          <EmptyText>暂无数据</EmptyText>
        ) : (
          <BarList>
            {ranked.map(({ habit, rate, strength }) => (
              <BarRow key={habit.id}>
                <div className="name">
                  {habit.icon} {habit.name}
                </div>
                <div className="track">
                  <Fill $color={habit.color} $w={Math.min(rate, 100)} />
                </div>
                <div className="pct">{rate}%</div>
                <div className="strength" title="强度指数">
                  {strength}
                </div>
              </BarRow>
            ))}
          </BarList>
        )}
      </ChartCard>

      <SectionTitle>年度热力图（颜色越深完成越好）</SectionTitle>
      <ChartCard>
        <HeatWrap>
          <HeatGrid $cols={heat.cols}>
            {heat.labels.map((m) => (
              <HeatMonthLabel key={`m-${m.week}`} style={{ gridColumn: m.week + 1, gridRow: 1 }}>
                {m.label}
              </HeatMonthLabel>
            ))}
            {heat.cells.map((c) => (
              <HeatCell
                key={c.key}
                $level={c.level}
                title={`${c.date} · 完成率 ${Math.round((c.level / 4) * 100)}%`}
                style={{ gridArea: `${c.dow + 2} / ${c.week + 1}` }}
              />
            ))}
          </HeatGrid>
          <HeatLegend>
            <span>少</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <HeatCell key={l} $level={l} style={{ width: 12, height: 12 }} />
            ))}
            <span>多</span>
          </HeatLegend>
        </HeatWrap>
      </ChartCard>
    </Wrap>
  )
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const SectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${mx.text2};
`

const ChartCard = styled.div`
  background: ${mx.card};
  border: 1px solid ${mx.border};
  border-radius: 14px;
  padding: 14px;
  svg {
    width: 100%;
    height: 120px;
    display: block;
  }
`

const BarList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  grid-template-columns: 130px 1fr 52px 40px;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: ${mx.text};
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

const HeatWrap = styled.div`
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

/*
 * 弹性热力网格：列 repeat(cols, 1fr) 均分容器全部宽度（最大化铺满），
 * 高度定高 clamp 后 7 行 1fr 均分——格子统一尺寸、双向弹性、不变形。
 * 超宽屏时容器 1680px 封顶居中，格子不会大到离谱。
 */
const HeatGrid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$cols}, 1fr);
  grid-template-rows: 16px repeat(7, 1fr);
  gap: 3px;
  height: clamp(170px, 22vh, 240px);
`

const HeatMonthLabel = styled.div`
  font-size: 10.5px;
  color: ${mx.text3};
  white-space: nowrap;
  align-self: end;
`

const HeatCell = styled.div<{ $level: number }>`
  border-radius: 4px;
  background: ${(p) => (p.$level <= 0 ? mx.soft : mx.accent)};
  opacity: ${(p) => (p.$level <= 0 ? 1 : 0.25 + p.$level * 0.19)};
`

const HeatLegend = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-size: 11px;
  color: ${mx.text3};
`

export default StatsView
