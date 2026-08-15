import KeyvStorage from '@kangfenmao/keyv-storage'
import { loggerService } from '@logger'

import { startAutoSync } from './services/BackupService'
import storeSyncService from './services/StoreSyncService'
import store from './store'

loggerService.initWindowSource('mainWindow')

function initKeyv() {
  window.keyv = new KeyvStorage()
  void window.keyv.init()
}

function initAutoSync() {
  setTimeout(() => {
    const { webdavAutoSync, localBackupAutoSync, s3 } = store.getState().settings
    if (webdavAutoSync || (s3 && s3.autoSync) || localBackupAutoSync) {
      startAutoSync()
    }
  }, 8000)
}

function initStoreSync() {
  storeSyncService.subscribe()
}

initKeyv()
initAutoSync()
initStoreSync()
