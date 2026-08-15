import { SettingOutlined } from '@ant-design/icons'
import Selector from '@renderer/components/Selector'
import { useSettings } from '@renderer/hooks/useSettings'
import { SettingDivider } from '@renderer/pages/settings'
import { SettingRow } from '@renderer/pages/settings'
import { useAppDispatch } from '@renderer/store'
import { setGridColumns, setGridPopoverTrigger } from '@renderer/store/settings'
import { Col, Row, Slider } from 'antd'
import { Popover } from 'antd'
import type { FC } from 'react'
import { useState } from 'react'
const MessageGroupSettings: FC = () => {
  const dispatch = useAppDispatch()
  const { gridColumns, gridPopoverTrigger } = useSettings()
  const [gridColumnsValue, setGridColumnsValue] = useState(gridColumns)

  return (
    <Popover
      arrow={false}
      trigger={undefined}
      content={
        <div style={{ padding: 8 }}>
          <SettingRow>
            <div style={{ marginRight: 10 }}>{'网格详情触发'}</div>
            <Selector
              size={14}
              value={gridPopoverTrigger || 'hover'}
              onChange={(value) => dispatch(setGridPopoverTrigger(value))}
              options={[
                { label: '悬停显示', value: 'hover' },
                { label: '点击显示', value: 'click' }
              ]}
            />
          </SettingRow>
          <SettingDivider />
          <SettingRow>
            <div>{'消息网格展示列数'}</div>
          </SettingRow>
          <Row align="middle" gutter={10}>
            <Col span={24}>
              <Slider
                value={gridColumnsValue}
                style={{ width: '100%' }}
                onChange={(value) => setGridColumnsValue(value)}
                onChangeComplete={(value) => dispatch(setGridColumns(value))}
                min={2}
                max={6}
                step={1}
              />
            </Col>
          </Row>
        </div>
      }>
      <SettingOutlined style={{ marginLeft: 15, cursor: 'pointer' }} />
    </Popover>
  )
}

export default MessageGroupSettings
