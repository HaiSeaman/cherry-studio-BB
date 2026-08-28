import '@renderer/assets/styles/index.css'
import '@renderer/assets/styles/tailwind.css'
import '@ant-design/v5-patch-for-react-19'

import { loggerService } from '@logger'
import { getToastUtilities } from '@renderer/components/TopView/toast'
import AntdProvider from '@renderer/context/AntdProvider'
import { CodeStyleProvider } from '@renderer/context/CodeStyleProvider'
import { ThemeProvider } from '@renderer/context/ThemeProvider'
import store, { persistor } from '@renderer/store'
import type { FC } from 'react'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { initKeyv, subscribeStoreSync } from '../../bootstrap'
import SelectionActionApp from './SelectionActionApp'

loggerService.initWindowSource('SelectionActionWindow')

/**
 * fetchChatCompletion depends on this,
 * which is not a good design, but we have to add it for now
 */
initKeyv()
subscribeStoreSync()

const App: FC = () => {
  //actionWindow should register its own message component
  useEffect(() => {
    window.toast = getToastUtilities()
  }, [])

  return (
    <Provider store={store}>
      <ThemeProvider>
        <AntdProvider>
          <CodeStyleProvider>
            <PersistGate loading={null} persistor={persistor}>
              <SelectionActionApp />
            </PersistGate>
          </CodeStyleProvider>
        </AntdProvider>
      </ThemeProvider>
    </Provider>
  )
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)
