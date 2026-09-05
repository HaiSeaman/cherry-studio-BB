import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import EmojiAvatar from '@renderer/components/Avatar/EmojiAvatar'
import { isLinux, isMac, isWin } from '@renderer/config/constant'
import { UserAvatar } from '@renderer/config/env'
import useAvatar from '@renderer/hooks/useAvatar'
import { useFullscreen } from '@renderer/hooks/useFullscreen'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import { useMinapps } from '@renderer/hooks/useMinapps'
import { modelGenerating, useRuntime } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings'
import { getSidebarIconLabel } from '@renderer/i18n/label'
import { useAppDispatch } from '@renderer/store'
import { setSidebarIcons } from '@renderer/store/settings'
import type { SidebarIcon } from '@renderer/types'
import { isEmoji } from '@renderer/utils'
import { IpcChannel } from '@shared/IpcChannel'
import { Avatar, Tooltip } from 'antd'
import {
  BookOpen,
  CalendarCheck2,
  LayoutGrid,
  MessageSquare,
  Minus,
  Settings,
  Square,
  StickyNote,
  Tv,
  X
} from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'

import UserPopup from '../Popups/UserPopup'
import { WindowRestoreIcon } from '../WindowControls'
import { SidebarOpenedMinappTabs, SidebarPinnedApps } from './PinnedMinapps'

const Sidebar: FC = () => {
  const { hideMinappPopup } = useMinappPopup()
  const { minappShow } = useRuntime()
  const { sidebarIcons } = useSettings()
  const { pinned } = useMinapps()

  const { pathname } = useLocation()
  const navigate = useNavigate()

  const avatar = useAvatar()
  const onEditUser = () => UserPopup.show()

  // 老版本持久化 settings 可能缺 sidebarIcons 字段（autoMerge 整体替换），缺省按空列表兜底
  const visibleIcons = sidebarIcons?.visible ?? []
  const showPinnedApps = pinned.length > 0 && visibleIcons.includes('minapp')

  // 生成中禁止切换（modelGenerating 拒绝）：静默拦截，弹窗保持打开，
  // 避免"弹窗关了却没跳转"的困惑，也不产生未处理的 Promise 拒绝
  const to = async (path: string) => {
    try {
      await modelGenerating()
      hideMinappPopup()
      navigate(path)
    } catch {
      // 生成进行中：不导航
    }
  }

  const isFullscreen = useFullscreen()

  // 挂件「打开主程序」按钮：唤醒主窗口并导航到效率中控台（便签页 = 效率中控台，音乐模块同页）
  useEffect(() => {
    const listener = () => to('/notes')
    window.electron?.ipcRenderer.on(IpcChannel.MusicWidget_OpenMain, listener)
    return () => {
      window.electron?.ipcRenderer.removeListener(IpcChannel.MusicWidget_OpenMain, listener)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Container $isFullscreen={isFullscreen} id="app-sidebar" style={{ zIndex: minappShow ? 10000 : 0 }}>
      <SidebarGlass />
      {/* 上段：窗口控制（关闭/最大化/最小化）+ 设置 */}
      <Menus>
        {!isMac && <SidebarWindowControls />}
        <Divider />
        <Tooltip title={'设置'} mouseEnterDelay={0.8} placement="right">
          <StyledLink onClick={() => void to('/settings/provider')}>
            <Icon className={pathname.startsWith('/settings') && !minappShow ? 'active' : ''}>
              <Settings size={20} className="icon" />
            </Icon>
          </StyledLink>
        </Tooltip>
      </Menus>
      {/* 中段：固定小程序图标 */}
      <MainMenusContainer>
        {showPinnedApps && (
          <AppsContainer>
            <Divider />
            <Menus>
              <SidebarPinnedApps />
            </Menus>
          </AppsContainer>
        )}
      </MainMenusContainer>
      {/* 下段：打开的小程序页签（从「小程序」入口向上排列）+ 主菜单 + 头像 */}
      <Menus>
        <SidebarOpenedMinappTabs />
        <MainMenus />
        {isEmoji(avatar) ? (
          <EmojiAvatar onClick={onEditUser} className="sidebar-avatar" size={31} fontSize={18}>
            {avatar}
          </EmojiAvatar>
        ) : (
          <AvatarImg src={avatar || UserAvatar} draggable={false} className="nodrag" onClick={onEditUser} />
        )}
      </Menus>
    </Container>
  )
}

/** 侧边栏底部窗口控制键（最小化/最大化/关闭，与设置键同列竖排） */
const SidebarWindowControls: FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    void window.api.windowControls.isMaximized().then(setIsMaximized)
    const unsubscribe = window.api.windowControls.onMaximizedChange(setIsMaximized)
    return () => {
      unsubscribe()
    }
  }, [])

  if (!isWin && !isLinux) return null

  return (
    <WinControlGroup>
      <Tooltip title={'关闭'} mouseEnterDelay={0.8} placement="right">
        <WinBtn aria-label="关闭" $danger onClick={() => void window.api.windowControls.close()}>
          <X size={16} />
        </WinBtn>
      </Tooltip>
      <Tooltip title={isMaximized ? '还原' : '最大化'} mouseEnterDelay={0.8} placement="right">
        <WinBtn
          aria-label={isMaximized ? '还原' : '最大化'}
          onClick={() => {
            if (isMaximized) void window.api.windowControls.unmaximize()
            else void window.api.windowControls.maximize()
          }}>
          {isMaximized ? <WindowRestoreIcon size="14" /> : <Square size={13} />}
        </WinBtn>
      </Tooltip>
      <Tooltip title={'最小化'} mouseEnterDelay={0.8} placement="right">
        <WinBtn aria-label="最小化" onClick={() => void window.api.windowControls.minimize()}>
          <Minus size={16} />
        </WinBtn>
      </Tooltip>
    </WinControlGroup>
  )
}

const WinControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
`

const WinBtn = styled.button<{ $danger?: boolean }>`
  width: 35px;
  height: 35px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--color-icon);
  cursor: pointer;
  -webkit-app-region: none;
  transition: all 0.15s ease;
  &:hover {
    background: ${(p) => (p.$danger ? '#e81123' : 'var(--color-background-soft)')};
    color: ${(p) => (p.$danger ? '#ffffff' : 'var(--color-icon-white)')};
  }
`

const MainMenus: FC = () => {
  const { hideMinappPopup } = useMinappPopup()
  const { pathname } = useLocation()
  const { sidebarIcons } = useSettings()
  const { minappShow } = useRuntime()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  // 生成中禁止切换（modelGenerating 拒绝）：静默拦截，弹窗保持打开，不产生未处理拒绝
  const to = async (path: string) => {
    try {
      await modelGenerating()
      hideMinappPopup()
      navigate(path)
    } catch {
      // 生成进行中：不导航
    }
  }

  const isRoute = (path: string): string => (pathname === path && !minappShow ? 'active' : '')
  const isRoutes = (path: string): string => (pathname.startsWith(path) && path !== '/' && !minappShow ? 'active' : '')

  const iconMap = {
    assistants: <MessageSquare size={18} className="icon" />,
    minapp: <LayoutGrid size={18} className="icon" />,
    notes: <StickyNote size={18} className="icon" />,
    habits: <CalendarCheck2 size={18} className="icon" />,
    knowledge: <BookOpen size={18} className="icon" />,
    iptv: <Tv size={18} className="icon" />
  }

  const pathMap = {
    assistants: '/',
    minapp: '/apps',
    notes: '/notes',
    habits: '/habits',
    knowledge: '/knowledge',
    iptv: '/iptv'
  }

  // 右侧导航栏下段顺序：完全跟随「显示设置→侧边栏设置」持久化的 visible 顺序，
  // 且支持在侧边栏上直接按住拖动换位（拖完写回 setSidebarIcons，与设置页共享同一份配置）
  const renderOrder: SidebarIcon[] = (sidebarIcons?.visible ?? []).filter((icon) => icon in pathMap)

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result
    if (!destination || (destination.index === source.index && destination.droppableId === source.droppableId)) return
    const list = [...renderOrder]
    const [removed] = list.splice(source.index, 1)
    list.splice(destination.index, 0, removed)
    dispatch(setSidebarIcons({ visible: list }))
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="sidebar-main-menus" direction="vertical">
        {(provided) => (
          <SortableMenuList ref={provided.innerRef} {...provided.droppableProps}>
            {renderOrder.map((icon, index) => {
              const path = pathMap[icon]
              const isActive = path === '/' ? isRoute(path) : isRoutes(path)
              return (
                <Draggable key={icon} draggableId={icon} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <SortableItem
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      $dragging={dragSnapshot.isDragging}>
                      <Tooltip title={getSidebarIconLabel(icon)} mouseEnterDelay={0.8} placement="right">
                        <StyledLink onClick={() => void to(path)}>
                          <Icon className={isActive}>{iconMap[icon]}</Icon>
                        </StyledLink>
                      </Tooltip>
                    </SortableItem>
                  )}
                </Draggable>
              )
            })}
            {provided.placeholder}
          </SortableMenuList>
        )}
      </Droppable>
    </DragDropContext>
  )
}

/** 可拖拽排序的菜单容器：与外层 Menus 保持一致的竖排间距 */
const SortableMenuList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  -webkit-app-region: none;
`

/** 单个可拖拽项：整块作为拖拽把手；拖动中提升层级并给个轻微缩放反馈 */
const SortableItem = styled.div<{ $dragging?: boolean }>`
  -webkit-app-region: none;
  ${(p) => (p.$dragging ? 'z-index: 10; transform: scale(1.06);' : '')}
`

const Container = styled.div<{ $isFullscreen: boolean }>`
  position: relative;
  z-index: 0;
  /* 恒贴右：路由切换瞬间内容区卸载（懒加载）时，避免 Sidebar 被 flex 布局甩到左侧闪现 */
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  padding-bottom: 12px;
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: ${({ $isFullscreen }) => (isMac && !$isFullscreen ? 'calc(100vh - var(--navbar-height))' : '100vh')};
  -webkit-app-region: drag !important;
  margin-top: ${({ $isFullscreen }) => (isMac && !$isFullscreen ? 'env(titlebar-area-height)' : 0)};

  .sidebar-avatar {
    margin-bottom: ${isMac ? '12px' : '12px'};
    margin-top: ${isMac ? '0px' : '2px'};
    -webkit-app-region: none;
  }
`

/** 磨砂玻璃背景层：主题背景色半透明（blur 放在非拖拽元素上，Electron 兼容） */
const SidebarGlass = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  -webkit-app-region: none;
  background: color-mix(in srgb, var(--color-background) 50%, transparent);
  backdrop-filter: blur(18px) saturate(1.45);
  box-shadow: var(--glass-shadow);
  [navbar-position='right'] & {
    border-left: 1px solid var(--glass-border);
  }
`

const AvatarImg = styled(Avatar)`
  width: 31px;
  height: 31px;
  background-color: var(--color-background-soft);
  margin-bottom: ${isMac ? '12px' : '12px'};
  margin-top: ${isMac ? '0px' : '2px'};
  border: none;
  cursor: pointer;
`

const MainMenusContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
`

const Menus = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
`

const Icon = styled.div`
  width: 35px;
  height: 35px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  box-sizing: border-box;
  -webkit-app-region: none;
  border: 0.5px solid transparent;
  .icon {
    color: var(--color-icon);
  }
  &:hover {
    background-color: var(--color-background-soft);
    opacity: 0.8;
    cursor: pointer;
    .icon {
      color: var(--color-icon-white);
    }
  }
  &.active {
    background-color: var(--color-white);
    border: 0.5px solid var(--color-border);
    .icon {
      color: var(--color-primary);
    }
  }

  &.opened-minapp {
    position: relative;
  }
  &.opened-minapp::after {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    border-radius: inherit;
    opacity: 0.45;
    border: 0.5px solid var(--color-primary);
  }
`

const StyledLink = styled.div`
  text-decoration: none;
  -webkit-app-region: none;
  &* {
    user-select: none;
  }
`

const AppsContainer = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
  margin-bottom: 10px;
  -webkit-app-region: none;
  &::-webkit-scrollbar {
    display: none;
  }
`

const Divider = styled.div`
  width: 50%;
  margin: 8px 0;
  border-bottom: 0.5px solid var(--color-border);
`

export default Sidebar
