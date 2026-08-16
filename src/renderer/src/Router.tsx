import '@renderer/databases'

import { type FC, lazy, Suspense, useMemo } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'

import Sidebar from './components/app/Sidebar'
import WindowControls from './components/WindowControls'
import styled from 'styled-components'
import { ErrorBoundary } from './components/ErrorBoundary'
import NavigationHandler from './handler/NavigationHandler'
import { useOnboardingState } from './hooks/useOnboardingState'
import HomePage from './pages/home/HomePage'
import LaunchpadPage from './pages/launchpad/LaunchpadPage'
import { OnboardingPage } from './pages/onboarding'

// 懒加载的非首屏页面（减少首屏 JS 解析量）
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const MinAppPage = lazy(() => import('./pages/minapps/MinAppPage'))
const MinAppsPage = lazy(() => import('./pages/minapps/MinAppsPage'))
const PaintPage = lazy(() => import('./pages/paint/PaintPage'))
const MusicPage = lazy(() => import('./pages/music/MusicPage'))
const NotesPage = lazy(() => import('./pages/notes/NotesPage'))

const Router: FC = () => {
  const { onboardingCompleted, completeOnboarding } = useOnboardingState()

  const routes = useMemo(() => {
    return (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/apps/:appId" element={<MinAppPage />} />
            <Route path="/apps" element={<MinAppsPage />} />
            <Route path="/paint" element={<PaintPage />} />
            <Route path="/music" element={<MusicPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route path="/launchpad" element={<LaunchpadPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    )
  }, [])

  if (!onboardingCompleted) {
    return <OnboardingPage onComplete={completeOnboarding} />
  }

  return (
    <HashRouter>
      <Sidebar />
      <AppChrome>
        <WindowDragBar />
        <FloatingControls>
          <WindowControls />
        </FloatingControls>
        <ContentShell>{routes}</ContentShell>
      </AppChrome>
      <NavigationHandler />
    </HashRouter>
  )
}

export default Router

/** 无边框窗口框：内容区 + 顶部透明拖拽条 + 右上角玻璃窗口控制键（全页面共享） */
const AppChrome = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const WindowDragBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--navbar-height);
  z-index: 95;
  -webkit-app-region: drag;
`

const FloatingControls = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  height: var(--navbar-height);
  display: flex;
  align-items: center;
  z-index: 96;
  background: var(--glass-bg);
  backdrop-filter: blur(14px) saturate(1.35);
  border-bottom-left-radius: 14px;
  border-left: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
`

/** 内容区：顶部留白给拖拽条，内容从下方开始（页面高度 100%） */
const ContentShell = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: var(--navbar-height);
  overflow: hidden;
`
