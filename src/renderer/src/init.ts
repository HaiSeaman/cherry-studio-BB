import { loggerService } from '@logger'

import { startAutoSync } from './services/BackupService'
import store from './store'
import { initKeyv, subscribeStoreSync } from './windows/bootstrap'

loggerService.initWindowSource('mainWindow')

function initAutoSync() {
  setTimeout(() => {
    const { webdavAutoSync, localBackupAutoSync, s3 } = store.getState().settings
    if (webdavAutoSync || (s3 && s3.autoSync) || localBackupAutoSync) {
      startAutoSync()
    }
  }, 8000)
}

initKeyv()
initAutoSync()
subscribeStoreSync()
