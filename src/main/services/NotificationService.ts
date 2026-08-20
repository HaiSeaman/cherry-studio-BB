import type { Notification } from '@types'
import { Notification as ElectronNotification } from 'electron'

import { windowService } from './WindowService'

class NotificationService {
  public async sendNotification(notification: Notification) {
    // 使用 Electron Notification API
    // silent: true —— 提示音统一由渲染进程 NotificationProvider 播放（默认叮/自定义文件），
    // 避免系统再播一次默认提示音造成"双重发声"。
    const electronNotification = new ElectronNotification({
      title: notification.title,
      body: notification.message,
      silent: true
    })

    electronNotification.on('click', () => {
      windowService.getMainWindow()?.show()
      windowService.getMainWindow()?.webContents.send('notification-click', notification)
    })

    electronNotification.show()
  }
}

export default NotificationService
