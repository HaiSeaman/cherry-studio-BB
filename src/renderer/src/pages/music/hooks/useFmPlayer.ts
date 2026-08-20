import { useEffect, useSyncExternalStore } from 'react'

import { playerStore } from '../services/playerStore'
import type { FmStatus, RadioStation } from '../types'

export type { FmStatus }

/**
 * FM 电台播放 hook（playerStore 全局状态机的薄适配层）：
 * 状态机（超时判定/错误切台/网速采样）全部在 services/playerStore.ts（模块级单例，切页不丢），
 * 这里仅负责喂数据（电台列表）与订阅状态切片；组件调用面 API 与旧实现完全一致。
 */
export function useFmPlayer(stations: RadioStation[]) {
  useEffect(() => {
    playerStore.setStations(stations)
  }, [stations])

  const st = useSyncExternalStore(playerStore.subscribeFm, playerStore.getFmSnapshot, playerStore.getFmSnapshot)

  const currentStation = stations.find((s) => s.url === st.url) || null

  return {
    currentUrl: st.url,
    currentStation,
    status: st.status,
    kbps: st.kbps,
    errorMsg: st.errorMsg,
    play: playerStore.fmPlay,
    toggle: playerStore.fmToggle,
    prev: playerStore.fmPrev,
    next: playerStore.fmNext
  }
}
