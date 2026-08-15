import { GlobalOutlined } from '@ant-design/icons'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const WebSearchTag = ({ size, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#1677ff"
      icon={<GlobalOutlined style={{ fontSize: size }} />}
      tooltip={showTooltip ? '联网' : undefined}
      {...restProps}>
      {showLabel ? '联网' : ''}
    </CustomTag>
  )
}
