import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const ReasoningTag = ({ size, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#6372bd"
      icon={<i className="iconfont icon-thinking" />}
      tooltip={showTooltip ? '推理' : undefined}
      {...restProps}>
      {showLabel ? '推理' : ''}
    </CustomTag>
  )
}
