import { Navbar, NavbarMain } from '@renderer/components/app/Navbar'
import { db } from '@renderer/databases'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { useLiveQuery } from 'dexie-react-hooks'
import { type FC, useEffect } from 'react'
import styled from 'styled-components'

import PaintContent from './PaintContent'
import PaintInputbar from './PaintInputbar'
import PaintSidebar from './PaintSidebar'
import { createPaintTopic } from './services/paintService'
import { setActiveTopicId } from './store/paintSlice'

/**
 * 图片生成（绘画）工作台页面
 * 布局：顶部 Navbar（含窗口控制按钮）+ 左侧历史列表 + 右侧（上方图片展示区 / 下方输入区）
 * Navbar 与小程序页（MinAppsPage）保持一致，保证菜单栏/窗口控制按钮正常显示
 */
const PaintPage: FC = () => {
  const dispatch = useAppDispatch()
  const activeTopicId = useAppSelector((s) => s.paint.activeTopicId)

  const paintTopics = useLiveQuery(async () => {
    const all = await db.topics.filter((t) => t.type === 'paint').toArray()
    return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }, [])

  // 首次进入页面时自动创建一个绘画会话
  useEffect(() => {
    if (!activeTopicId) {
      void createPaintTopic().then((id) => dispatch(setActiveTopicId(id)))
    }
  }, [activeTopicId, dispatch])

  return (
    <Container>
      <Navbar>
        <NavbarMain>{'图片生成'}</NavbarMain>
      </Navbar>
      <MainArea>
        <PaintSidebar topics={paintTopics ?? []} activeTopicId={activeTopicId} />
        <ContentArea>
          <PaintContent topicId={activeTopicId} />
          <PaintInputbar />
        </ContentArea>
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
  flex-direction: row;
  overflow: hidden;
  min-height: 0;
  height: calc(100vh - var(--navbar-height));
`

const ContentArea = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`

export default PaintPage
