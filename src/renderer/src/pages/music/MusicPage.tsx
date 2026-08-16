import { Navbar, NavbarMain } from '@renderer/components/app/Navbar'
import { type FC } from 'react'
import styled from 'styled-components'

import FmRadio from './components/FmRadio'

/**
 * 音乐工作台页面
 * 布局：顶部 Navbar + 双栏面板（左：本地音乐播放器 / 右：FM 网络电台），窄屏自动上下堆叠
 */
const MusicPage: FC = () => {
  return (
    <Container>
      <Navbar>
        <NavbarMain>{'音乐'}</NavbarMain>
      </Navbar>
      <MainArea>
        <Panel>{'本地音乐（建设中）'}</Panel>
        <FmRadio />
      </MainArea>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  [navbar-position='left'] & {
    max-width: calc(100vw - var(--sidebar-width));
  }
  [navbar-position='top'] & {
    max-width: 100vw;
  }
`

const MainArea = styled.div`
  display: flex;
  flex: 1;
  gap: 12px;
  height: calc(100vh - var(--navbar-height));
  padding: 12px;
  overflow: hidden;
  @media (max-width: 700px) {
    flex-direction: column;
  }
`

const Panel = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  overflow: hidden;
  color: var(--color-text-2);
`

export default MusicPage
