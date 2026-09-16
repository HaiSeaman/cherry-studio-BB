import { allMinApps } from '@renderer/config/minapps'
import type { RootState } from '@renderer/store'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setDisabledMinApps, setMinApps, setPinnedMinApps } from '@renderer/store/minapps'
import type { MinAppType } from '@renderer/types'
import { useCallback, useMemo } from 'react'

/**
 * 小程序读写：Redux 存全量应用，界面「隐藏区」即 disabled 列表。
 *
 * 已移除按地区过滤的逻辑：所有小程序一律显示，是否隐藏完全由用户在设置页拖拽决定。
 * （原先 supportedRegions 不含 Global 的应用会在「地区=全球」时被静默隐藏，用户以为被删了）
 */
export const useMinapps = () => {
  const { enabled, disabled, pinned } = useAppSelector((state: RootState) => state.minapps)
  const dispatch = useAppDispatch()

  const mapApps = useCallback(
    (apps: MinAppType[]) => apps.map((app) => allMinApps.find((item) => item.id === app.id) || app),
    []
  )

  const getAllApps = useCallback(
    (apps: MinAppType[], disabledApps: MinAppType[]) => {
      const mappedApps = mapApps(apps)
      const existingIds = new Set(mappedApps.map((app) => app.id))
      const disabledIds = new Set(disabledApps.map((app) => app.id))
      const missingApps = allMinApps.filter((app) => !existingIds.has(app.id) && !disabledIds.has(app.id))
      return [...mappedApps, ...missingApps]
    },
    [mapApps]
  )

  // READ: 显示区 = 全量 − 隐藏区
  const minapps = useMemo(() => {
    const allApps = getAllApps(enabled, disabled)
    const disabledIds = new Set(disabled.map((app) => app.id))
    return allApps.filter((app) => !disabledIds.has(app.id))
  }, [enabled, disabled, getAllApps])

  const disabledApps = useMemo(() => mapApps(disabled), [disabled, mapApps])

  const pinnedApps = useMemo(() => mapApps(pinned), [pinned, mapApps])

  // WRITE: 写回显示区时补齐新内置应用，但不动隐藏区
  const updateMinapps = useCallback(
    (visibleApps: MinAppType[]) => {
      const disabledIds = new Set(disabled.map((app) => app.id))
      const withoutDisabled = visibleApps.filter((app) => !disabledIds.has(app.id))
      const existingIds = new Set(withoutDisabled.map((app) => app.id))
      const missingApps = allMinApps.filter((app) => !existingIds.has(app.id) && !disabledIds.has(app.id))
      dispatch(setMinApps([...withoutDisabled, ...missingApps]))
    },
    [dispatch, disabled]
  )

  const updateDisabledMinapps = useCallback(
    (apps: MinAppType[]) => {
      dispatch(setDisabledMinApps(apps))
    },
    [dispatch]
  )

  const updatePinnedMinapps = useCallback(
    (apps: MinAppType[]) => {
      dispatch(setPinnedMinApps(apps))
    },
    [dispatch]
  )

  return {
    minapps,
    disabled: disabledApps,
    pinned: pinnedApps,
    updateMinapps,
    updateDisabledMinapps,
    updatePinnedMinapps
  }
}
