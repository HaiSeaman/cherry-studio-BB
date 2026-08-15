import '@renderer/databases'

import { type FC, lazy, Suspense, useMemo } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'

import Sidebar from './components/app/Sidebar'
import { ErrorBoundary } from './components/ErrorBoundary'
import TabsContainer from './components/Tab/TabContainer'
import NavigationHandler from './handler/NavigationHandler'
import { useOnboardingState } from './hooks/useOnboardingState'
import { useNavbarPosition } from './hooks/useSettings'
import HomePage from './pages/home/HomePage'
import LaunchpadPage from './pages/launchpad/LaunchpadPage'
import { OnboardingPage } from './pages/onboarding'

// 懒加载的非首屏页面（减少首屏 JS 解析量）
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const MinAppPage = lazy(() => import('./pages/minapps/MinAppPage'))
const MinAppsPage = lazy(() => import('./pages/minapps/MinAppsPage'))
const PaintPage = lazy(() => import('./pages/paint/PaintPage'))

const Router: FC = () => {
  const { onboardingCompleted, completeOnboarding } = useOnboardingState()
  const { navbarPosition } = useNavbarPosition()

  const routes = useMemo(() => {
    return (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/apps/:appId" element={<MinAppPage />} />
            <Route path="/apps" element={<MinAppsPage />} />
            <Route path="/paint" element={<PaintPage />} />
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

  if (navbarPosition === 'left') {
    return (
      <HashRouter>
        <Sidebar />
        {routes}
        <NavigationHandler />
      </HashRouter>
    )
  }

  return (
    <HashRouter>
      <NavigationHandler />
      <TabsContainer>{routes}</TabsContainer>
    </HashRouter>
  )
}

export default Router
