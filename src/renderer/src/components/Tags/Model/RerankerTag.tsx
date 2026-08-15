import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const RerankerTag = ({ size, ...restProps }: Props) => {
  return <CustomTag size={size} color="#6495ED" icon={'重排'} {...restProps} />
}
