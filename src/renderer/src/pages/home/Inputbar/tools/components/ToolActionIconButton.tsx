import { ActionIconButton } from '@renderer/components/Buttons'
import { Tooltip } from 'antd'
import { memo } from 'react'

interface ToolActionIconButtonProps extends React.ComponentProps<typeof ActionIconButton> {
  /** Tooltip 文案；按钮的 aria-label 自动取此值（各工具按钮二者的文案本就一致） */
  tooltip: string
}

/**
 * 工具条图标按钮：附带统一「顶部 tooltip」外壳。
 * 输入端 12+ 个工具按钮之前各自重复 `<Tooltip placement="top" .../>`，统一到此收敛。
 */
const ToolActionIconButton: React.FC<ToolActionIconButtonProps> = ({ tooltip, ...props }) => {
  return (
    <Tooltip placement="top" title={tooltip} mouseLeaveDelay={0} arrow>
      <ActionIconButton aria-label={tooltip} {...props} />
    </Tooltip>
  )
}

export default memo(ToolActionIconButton)