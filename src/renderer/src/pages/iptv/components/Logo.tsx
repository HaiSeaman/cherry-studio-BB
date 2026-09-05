import { useState } from 'react'
import styled from 'styled-components'

interface LogoProps {
  name: string
  logo: string | null
  size?: number
}

/** 频道 Logo：加载失败/为空 → 频道名首字母彩色圆底兜底，永不空白 */
export const Logo = ({ name, logo, size = 32 }: LogoProps) => {
  // 记录"是哪个 logo 地址失败"而非布尔：虚拟列表复用组件实例换频道时自动复位，避免误兜底
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const showImg = logo != null && logo !== failedLogo

  return (
    <LogoBox $size={size}>
      {showImg ? (
        <img src={logo} alt={name} loading="lazy" onError={() => setFailedLogo(logo)} />
      ) : (
        <Fallback>{name.trim().charAt(0).toUpperCase() || '?'}</Fallback>
      )}
    </LogoBox>
  )
}

const LogoBox = styled.div<{ $size: number }>`
  width: ${(p) => p.$size}px;
  height: ${(p) => p.$size}px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background-soft, #f0f0f0);

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
`

const Fallback = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary, #1677ff);
`
