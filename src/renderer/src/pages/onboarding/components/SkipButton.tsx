import { Button } from 'antd'
import type { FC } from 'react'
interface SkipButtonProps {
  onSkip: () => void
}

const SkipButton: FC<SkipButtonProps> = ({ onSkip }) => {
  return (
    <Button
      type="text"
      className="text-(--color-text-3) opacity-50 hover:opacity-80"
      style={{ position: 'absolute', top: 16, right: 16, width: 'auto', zIndex: 10 }}
      onClick={onSkip}>
      {'跳过引导'}
    </Button>
  )
}

export default SkipButton
