import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const FreeTag = ({ size, showTooltip, ...restProps }: Props) => {
  return (
    <CustomTag size={size} color="#7cb305" icon={'免费'} tooltip={showTooltip ? '免费' : undefined} {...restProps} />
  )
}
