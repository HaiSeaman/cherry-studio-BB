import '@renderer/databases'

import { ErrorBoundary } from '@renderer/components/ErrorBoundary'
import { getToastUtilities } from '@renderer/components/TopView/toast'
import { useSettings } from '@renderer/hooks/useSettings'
import store, { persistor, useAppDispatch } from '@renderer/store'
import { setFilesPath, setResourcesPath } from '@renderer/store/runtime'
import { useEffect } from 'react'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'

import AntdProvider from '../../context/AntdProvider'
import { CodeStyleProvider } from '../../context/CodeStyleProvider'
import { ThemeProvider } from '../../context/ThemeProvider'
import HomeWindow from './home/HomeWindow'

// Inner component that uses the hook after Redux is initialized
function MiniWindowContent(): React.ReactElement {
  const { customCss } = useSettings()
  const dispatch = useAppDispatch()

  useEffect(() => {
    // mini 窗口是独立渲染进程，runtime.filesPath/resourcesPath 默认是空字符串
    // （该 slice 在 persist blacklist 中，且主窗口由 useAppInit 设置、mini 不会执行）。
    // 若不初始化，FileManager.getFilePath 会拼出 file:///<id><ext> 这类无效路径，
    // 聊天里的图片块（ImageBlock）将加载失败并提示「本地文件可能已被清理」。
    void window.api.getAppInfo().then((info) => {
      dispatch(setFilesPath(info.filesPath))
      dispatch(setResourcesPath(info.resourcesPath))
    })
  }, [dispatch])

  useEffect(() => {
    let customCssElement = document.getElementById('user-defined-custom-css') as HTMLStyleElement
    if (customCssElement) {
      customCssElement.remove()
    }

    if (customCss) {
      customCssElement = document.createElement('style')
      customCssElement.id = 'user-defined-custom-css'
      customCssElement.textContent = customCss
      document.head.appendChild(customCssElement)
    }
  }, [customCss])

  return <HomeWindow />
}

function MiniWindow(): React.ReactElement {
  useEffect(() => {
    window.toast = getToastUtilities()
  }, [])

  return (
    <Provider store={store}>
      <ThemeProvider>
        <AntdProvider>
          <CodeStyleProvider>
            <PersistGate loading={null} persistor={persistor}>
              <ErrorBoundary>
                <MiniWindowContent />
              </ErrorBoundary>
            </PersistGate>
          </CodeStyleProvider>
        </AntdProvider>
      </ThemeProvider>
    </Provider>
  )
}

export default MiniWindow
