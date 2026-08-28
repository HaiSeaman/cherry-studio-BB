import KeyvStorage from '@kangfenmao/keyv-storage'
import storeSyncService from '@renderer/services/StoreSyncService'

/**
 * Keyv 是模型 API 层（BaseProviders 等）的依赖，所有窗口都需要初始化。
 * 各窗口入口此前各自复制了这段逻辑，统一收口在此。
 */
export function initKeyv(): void {
  window.keyv = new KeyvStorage()
  void window.keyv.init()
}

export function subscribeStoreSync(): void {
  storeSyncService.subscribe()
}
