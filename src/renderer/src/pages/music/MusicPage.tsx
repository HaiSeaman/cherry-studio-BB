import { Navbar, NavbarMain } from '@renderer/components/app/Navbar'
import { type FC } from 'react'
import styled from 'styled-components'

import FmRadio from './components/FmRadio'
import LocalMusicPlayer from './components/LocalMusicPlayer'
import { mx } from './components/mx'

/**
 * 音乐工作台页面（晨间绿洲浅色主题）
 * 布局：顶部 Navbar + 双栏卡片（左：本地音乐 / 右：FM 电台），窄屏自动上下堆叠
 */
const MusicPage: FC = () => {
  return (
    <Container>
      <Navbar>
        <NavbarMain>{'音乐'}</NavbarMain>
      </Navbar>
      <MainArea>
        <LocalMusicPlayer />
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
  background: ${mx.paper};
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
  gap: 14px;
  height: 100%;
  padding: 14px;
  overflow: hidden;
  background: ${mx.paper};
  @media (max-width: 700px) {
    flex-direction: column;
    overflow-y: auto;
  }
`

export default MusicPage
