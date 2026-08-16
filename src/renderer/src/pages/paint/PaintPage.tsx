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

  // 进入页面：优先恢复最近使用的会话（避免每次重启都新建空会话累积）；完全没有会话才新建
  useEffect(() => {
    if (activeTopicId) return
    const list = paintTopics ?? []
    if (list.length > 0) {
      dispatch(setActiveTopicId(list[0].id))
      return
    }
    let cancelled = false
    void createPaintTopic()
      .then((id) => {
        // 等待期间用户已手动选了会话（activeTopicId 变化触发 effect 重跑）→ 丢弃本次新建
        if (!cancelled) dispatch(setActiveTopicId(id))
      })
      .catch(() => {
        window.toast.error('创建绘画会话失败')
      })
    return () => {
      cancelled = true
    }
  }, [activeTopicId, paintTopics, dispatch])

  return (
    <Container>
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
  /* 顶部导航已移除：页面顶满窗口（否则底部留 42px 空隙） */
  height: 100vh;
`

const ContentArea = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
`

export default PaintPage
