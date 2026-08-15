import { Button, Row, Tooltip } from 'antd'
import { Plus } from 'lucide-react'
import { memo } from 'react'
import styled from 'styled-components'

import { SettingTitle } from '../..'

interface HeaderSectionProps {
  customItemsCount: number
  maxCustomItems: number
  onReset: () => void
  onAdd: () => void
}

const SettingsActionsListHeader = memo(({ customItemsCount, maxCustomItems, onReset, onAdd }: HeaderSectionProps) => {
  const isCustomItemLimitReached = customItemsCount >= maxCustomItems

  return (
    <Row>
      <SettingTitle>{'功能'}</SettingTitle>
      <Spacer />
      <Tooltip title={'重置为默认功能，自定义功能不会被删除'}>
        <ResetButton type="text" onClick={onReset}>
          {'重置'}
        </ResetButton>
      </Tooltip>
      <Tooltip title={isCustomItemLimitReached ? `自定义功能已达上限 (${maxCustomItems} 个)` : '添加自定义功能'}>
        <Button
          type="primary"
          icon={<Plus size={16} />}
          onClick={onAdd}
          disabled={isCustomItemLimitReached}
          style={{ paddingInline: '8px' }}>
          {'自定义功能'}
        </Button>
      </Tooltip>
    </Row>
  )
})

const Spacer = styled.div`
  flex: 1;
`

const ResetButton = styled(Button)`
  margin: 0 8px;
  color: var(--color-text-3);
  &:hover {
    color: var(--color-primary);
  }
`

export default SettingsActionsListHeader
