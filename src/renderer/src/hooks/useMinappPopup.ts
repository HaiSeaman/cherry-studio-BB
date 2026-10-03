import { allMinApps } from '@renderer/config/minapps'
import { useRuntime } from '@renderer/hooks/useRuntime'
import { useSettings } from '@renderer/hooks/useSettings' // 使用设置中的值
import TabsService from '@renderer/services/TabsService'
import { useAppDispatch } from '@renderer/store'
import {
  setCurrentMinappId,
  setMinappShow,
  setOpenedKeepAliveMinapps,
  setOpenedOneOffMinapp
} from '@renderer/store/runtime'
import type { MinAppType } from '@renderer/types'
import { clearWebviewState } from '@renderer/utils/webviewStateManager'
import { LRUCache } from 'lru-cache'
import { useCallback, useEffect } from 'react'

let minAppsCache: LRUCache<string, MinAppType>

/**
 * Usage:
 *
 *   To control the minapp popup, you can use the following hooks:
 *     import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
 *
 *   in the component:
 *     const { openMinapp, openMinappKeepAlive, openMinappById,
 *             closeMinapp, hideMinappPopup, closeAllMinapps } = useMinappPopup()
 *
 *   To use some key states of the minapp popup:
 *     import { useRuntime } from '@renderer/hooks/useRuntime'
 *     const { openedKeepAliveMinapps, openedOneOffMinapp, minappShow } = useRuntime()
 */
export const useMinappPopup = () => {
  const dispatch = useAppDispatch()
  const { openedKeepAliveMinapps, openedOneOffMinapp, minappShow, currentMinappId } = useRuntime()
  const { maxKeepAliveMinapps } = useSettings() // 使用设置中的值

  const createLRUCache = useCallback(() => {
    const cache = new LRUCache<string, MinAppType>({
      max: maxKeepAliveMinapps ?? 10,
      disposeAfter: (_value, key) => {
        // Clean up WebView state when app is disposed from cache
        clearWebviewState(key)

        // Close corresponding tab if it exists
        const tabs = TabsService.getTabs()
        const tabToClose = tabs.find((tab) => tab.path === `/apps/${key}`)
        if (tabToClose) {
          TabsService.closeTab(tabToClose.id)
        }

        // Update Redux state
        dispatch(setOpenedKeepAliveMinapps(Array.from(cache.values())))
      },
      onInsert: () => {
        dispatch(setOpenedKeepAliveMinapps(Array.from(cache.values())))
      },
      updateAgeOnGet: true,
      updateAgeOnHas: true
    })
    return cache
  }, [dispatch, maxKeepAliveMinapps])

  // 缓存不存在时惰性创建（创建实例本身不 dispatch，留在渲染期无害）
  if (!minAppsCache) {
    minAppsCache = createLRUCache()
  }

  // 容量变化时的重建与 TabsService 引用同步：放在 effect 里执行，
  // 避免在渲染期触发 LRU 的 onInsert/disposeAfter 回调 → 渲染期 dispatch Redux
  useEffect(() => {
    // 缓存数量大小发生了改变
    if (minAppsCache.max !== (maxKeepAliveMinapps ?? 10)) {
      // 1. 当前小程序数量小于等于设置的缓存数量，直接重新建立缓存
      if (minAppsCache.size <= (maxKeepAliveMinapps ?? 10)) {
        // LRU cache 机制，后 set 的会被放到前面，所以需要反转一下
        const oldEntries = Array.from(minAppsCache.entries()).reverse()
        minAppsCache = createLRUCache()
        oldEntries.forEach(([key, value]) => {
          minAppsCache.set(key, value)
        })
      }
      // 2. 大于设置的缓存的话，就直到数量减少到设置的缓存数量
    }
    // 同步 TabsService 的 cache 引用：cache 重建时若未刷新，TabsService 将持有过期实例
    TabsService.setMinAppsCache(minAppsCache)
  }, [maxKeepAliveMinapps, createLRUCache])

  /** Open a minapp (popup shows and minapp loaded) */
  const openMinapp = useCallback(
    (app: MinAppType, keepAlive: boolean = false) => {
      if (keepAlive) {
        // 通过 get 和 set 去更新缓存，避免重复添加
        const cacheApp = minAppsCache.get(app.id)
        if (!cacheApp) minAppsCache.set(app.id, app)

        // 如果小程序已经打开，只切换显示
        if (openedKeepAliveMinapps.some((item) => item.id === app.id)) {
          dispatch(setCurrentMinappId(app.id))
          dispatch(setMinappShow(true))
          return
        }
        dispatch(setOpenedOneOffMinapp(null))
        dispatch(setCurrentMinappId(app.id))
        dispatch(setMinappShow(true))
        return
      }

      //if the minapp is not keep alive, open it as one-off minapp
      dispatch(setOpenedOneOffMinapp(app))
      dispatch(setCurrentMinappId(app.id))
      dispatch(setMinappShow(true))
      return
    },
    [dispatch, openedKeepAliveMinapps]
  )

  /** a wrapper of openMinapp(app, true) */
  const openMinappKeepAlive = useCallback(
    (app: MinAppType) => {
      openMinapp(app, true)
    },
    [openMinapp]
  )

  /** Open a minapp by id (look up the minapp in allMinApps) */
  const openMinappById = useCallback(
    (id: string, keepAlive: boolean = false) => {
      const app = allMinApps.find((app) => app?.id === id)
      if (app) {
        openMinapp(app, keepAlive)
      }
    },
    [openMinapp]
  )

  /** Close a minapp immediately (popup hides and minapp unloaded) */
  const closeMinapp = useCallback(
    (appid: string) => {
      if (openedKeepAliveMinapps.some((item) => item.id === appid)) {
        minAppsCache.delete(appid)
      } else if (openedOneOffMinapp?.id === appid) {
        dispatch(setOpenedOneOffMinapp(null))
      }

      // 仅当关闭的是当前展示的小程序时才收起抽屉；关闭其他页签不应影响当前展示
      if (currentMinappId === appid) {
        dispatch(setCurrentMinappId(''))
        dispatch(setMinappShow(false))
      }
      return
    },
    [dispatch, openedKeepAliveMinapps, openedOneOffMinapp, currentMinappId]
  )

  /** Close all minapps (popup hides and all minapps unloaded) */
  const closeAllMinapps = useCallback(() => {
    // minAppsCache.clear 会多次调用 dispose 方法
    // 重新创建一个 LRU Cache 替换
    minAppsCache = createLRUCache()
    // 同步新实例给 TabsService：否则其持有已废弃实例，关小程序 tab 时清理失效、渲染进程残留
    TabsService.setMinAppsCache(minAppsCache)
    dispatch(setOpenedKeepAliveMinapps([]))
    dispatch(setOpenedOneOffMinapp(null))
    dispatch(setCurrentMinappId(''))
    dispatch(setMinappShow(false))
  }, [dispatch, createLRUCache])

  /** Hide the minapp popup (only one-off minapp unloaded) */
  const hideMinappPopup = useCallback(() => {
    if (!minappShow) return

    if (openedOneOffMinapp) {
      dispatch(setOpenedOneOffMinapp(null))
      dispatch(setCurrentMinappId(''))
    }
    dispatch(setMinappShow(false))
  }, [dispatch, minappShow, openedOneOffMinapp])

  /** Smart open minapp (popup system) */
  const openSmartMinapp = useCallback(
    (config: MinAppType, keepAlive: boolean = false) => {
      openMinapp(config, keepAlive)
    },
    [openMinapp]
  )

  return {
    openMinapp,
    openMinappKeepAlive,
    openMinappById,
    closeMinapp,
    hideMinappPopup,
    closeAllMinapps,
    openSmartMinapp,
    // Expose cache instance for TabsService integration
    minAppsCache
  }
}
