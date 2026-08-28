import '@ant-design/v5-patch-for-react-19'

import { loggerService } from '@logger'
import { ThemeProvider } from '@renderer/context/ThemeProvider'
import store, { persistor } from '@renderer/store'
import type { FC } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import { subscribeStoreSync } from '../../bootstrap'
import SelectionToolbar from './SelectionToolbar'

loggerService.initWindowSource('SelectionToolbar')

subscribeStoreSync()

const App: FC = () => {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <PersistGate loading={null} persistor={persistor}>
          <SelectionToolbar />
        </PersistGate>
      </ThemeProvider>
    </Provider>
  )
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)
