import type { FC, PropsWithChildren } from 'react'
import type { HTMLAttributes } from 'react'
import styled from 'styled-components'

type Props = PropsWithChildren & HTMLAttributes<HTMLDivElement>

/**
 * 聊天页工具条头部容器（ChatNavBar 使用）。
 * 窗口级顶部导航（Navbar 主组件/WindowControls 等）已随无边框布局下线。
 */
export const NavbarHeader: FC<Props> = ({ children, ...props }) => {
  return <NavbarHeaderContent {...props}>{children}</NavbarHeaderContent>
}

const NavbarHeaderContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  min-height: var(--navbar-height);
  max-height: var(--navbar-height);
`
