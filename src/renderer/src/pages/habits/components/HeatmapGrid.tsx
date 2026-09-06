import type { FC, ReactNode } from 'react'
import styled from 'styled-components'

import { mx } from './mx'

/** 热力图格子（外观由调用方算好传入，本组件只负责布局） */
export interface HeatGridCell {
  key: string
  date: string
  week: number
  dow: number
  title?: string
  background: string
  opacity?: number
  outline?: string
}

interface Props {
  cols: number
  cells: HeatGridCell[]
  labels: { week: number; label: string }[]
  legend?: ReactNode
}

/**
 * GitHub 风格热力网格（列=周，7 行，月份标签）——统计视图 5 档完成率热力图
 * 与「自然年统计」单习惯热力图共用同一布局。
 */
const HeatmapGrid: FC<Props> = ({ cols, cells, labels, legend }) => {
  return (
    <HeatWrap>
      <HeatScroll>
        <HeatGrid $cols={cols}>
          {labels.map((m) => (
            <HeatMonthLabel key={`m-${m.week}`} style={{ gridColumn: m.week + 1, gridRow: 1 }}>
              {m.label}
            </HeatMonthLabel>
          ))}
          {cells.map((c) => (
            <HeatCell
              key={c.key}
              data-cell={c.date}
              title={c.title}
              style={{
                gridArea: `${c.dow + 2} / ${c.week + 1}`,
                background: c.background,
                opacity: c.opacity,
                outline: c.outline
              }}
            />
          ))}
        </HeatGrid>
      </HeatScroll>
      {legend && <HeatLegend>{legend}</HeatLegend>}
    </HeatWrap>
  )
}

const HeatWrap = styled.div`
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`

const HeatGrid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$cols}, 1fr);
  grid-template-rows: 16px repeat(7, 1fr);
  gap: 3px;
  height: clamp(170px, 22vh, 240px);
  /* 窄窗口防挤压：格子低于 14px 后横向滚动（滚动区由外层 HeatScroll 提供） */
  min-width: ${(p) => p.$cols * 14}px;
`

const HeatScroll = styled.div`
  overflow-x: auto;
  min-width: 0;
`

const HeatMonthLabel = styled.div`
  font-size: 10.5px;
  color: ${mx.text3};
  white-space: nowrap;
  align-self: end;
`

const HeatCell = styled.div`
  border-radius: 4px;
`

const HeatLegend = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  font-size: 11px;
  color: ${mx.text3};
`

export default HeatmapGrid
