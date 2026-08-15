import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const EmbeddingTag = ({ size, ...restProps }: Props) => {
  return <CustomTag size={size} color="#FFA500" icon={'嵌入'} {...restProps} />
}
