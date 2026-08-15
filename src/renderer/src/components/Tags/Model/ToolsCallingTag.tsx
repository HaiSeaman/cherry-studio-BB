import { ToolOutlined } from '@ant-design/icons'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const ToolsCallingTag = ({ size, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#f18737"
      icon={<ToolOutlined style={{ fontSize: size }} />}
      tooltip={showTooltip ? '工具' : undefined}
      {...restProps}>
      {showLabel ? '工具' : ''}
    </CustomTag>
  )
}
