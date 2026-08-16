import App from '@renderer/components/MinApp/MinApp'
import Scrollbar from '@renderer/components/Scrollbar'
import MinappSettingsPopup from './MiniappSettings/MinappSettingsPopup'
import { useMinapps } from '@renderer/hooks/useMinapps'
import { Button, Input } from 'antd'
import { Search, SettingsIcon } from 'lucide-react'
import type { FC } from 'react'
import React, { useState } from 'react'
import styled from 'styled-components'

import NewAppButton from './NewAppButton'

const AppsPage: FC = () => {
  const [search, setSearch] = useState('')
  const { minapps } = useMinapps()

  const filteredApps = search
    ? minapps.filter(
        (app) => app.name.toLowerCase().includes(search.toLowerCase()) || app.url.includes(search.toLowerCase())
      )
    : minapps

  // Calculate the required number of lines
  const itemsPerRow = Math.floor(930 / 115) // Maximum width divided by the width of each item (including spacing)
  const rowCount = Math.ceil((filteredApps.length + 1) / itemsPerRow) // +1 for the add button
  // Each line height is 85px (60px icon + 5px margin + 12px text + spacing)
  const containerHeight = rowCount * 85 + (rowCount - 1) * 25 // 25px is the line spacing.

  // Disable right-click menu in blank area
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  return (
    <Container onContextMenu={handleContextMenu}>
      <ContentContainer id="content-container">
        <MainContainer>
          <RightContainer>
            <HeaderContainer>
              <Input
                placeholder={'搜索'}
                className="nodrag"
                style={{ width: '30%', borderRadius: 15 }}
                variant="filled"
                suffix={<Search size={18} />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                type="text"
                className="nodrag"
                icon={<SettingsIcon size={18} color="var(--color-text-2)" />}
                onClick={() => MinappSettingsPopup.show()}
              />
            </HeaderContainer>
            <AppsContainerWrapper>
              <AppsContainer style={{ height: containerHeight }}>
                {filteredApps.map((app) => (
                  <App key={app.id} app={app} />
                ))}
                <NewAppButton />
              </AppsContainer>
            </AppsContainerWrapper>
          </RightContainer>
        </MainContainer>
      </ContentContainer>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`

const ContentContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  justify-content: center;
  height: 100%;
`

const HeaderContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  height: 60px;
  width: 100%;
  gap: 10px;
`

const MainContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  /* 顶部导航已移除：页面顶满窗口（否则底部留 42px 空隙） */
  height: 100vh;
  width: 100%;
`

const RightContainer = styled(Scrollbar)`
  display: flex;
  flex: 1 1 0%;
  min-width: 0;
  flex-direction: column;
  height: 100%;
  align-items: center;
  height: 100vh;
`

const AppsContainerWrapper = styled(Scrollbar)`
  display: flex;
  flex: 1;
  flex-direction: row;
  justify-content: center;
  padding: 50px 0;
  width: 100%;
  margin-bottom: 20px;
  [navbar-position='top'] & {
    padding: 20px 0;
  }
`

const AppsContainer = styled.div`
  display: grid;
  min-width: 0;
  max-width: 930px;
  margin: 0 20px;
  width: 100%;
  grid-template-columns: repeat(auto-fill, 90px);
  gap: 25px;
  justify-content: center;
`

export default AppsPage
