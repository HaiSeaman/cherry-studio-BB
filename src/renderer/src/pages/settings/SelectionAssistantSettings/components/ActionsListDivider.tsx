import { memo } from 'react'
import styled from 'styled-components'

interface DividerProps {
  enabledCount: number
  maxEnabled: number
}

const ActionsListDivider = memo(({ enabledCount, maxEnabled }: DividerProps) => {
  return (
    <DividerContainer>
      <DividerLine />
      <DividerText>{`拖拽排序，移动到上方以启用功能 (${enabledCount}/${maxEnabled})`}</DividerText>
      <DividerLine />
    </DividerContainer>
  )
})

const DividerContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-3);
  margin: 16px 12px;
`

const DividerLine = styled.div`
  flex: 1;
  height: 2px;
  background: var(--color-border);
`

const DividerText = styled.span`
  margin: 0 16px;
`

export default ActionsListDivider
