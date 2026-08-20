import store from '@renderer/store'
import { initialState as defaultSettings } from '@renderer/store/settings'
import type { Notification } from '@renderer/types/notification'

import { NotificationQueue } from '../queue/NotificationQueue'

export class NotificationService {
  private static instance: NotificationService
  private queue: NotificationQueue

  private constructor() {
    this.queue = NotificationQueue.getInstance()
    this.setupNotificationClickHandler()
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  /**
   * 发送通知
   * @param notification 要发送的通知
   */
  public async send(notification: Notification): Promise<void> {
    const settings = store.getState().settings.notification || defaultSettings.notification
    const item = settings[notification.source]

    // 兼容新旧结构：新结构为 { enabled, sound }，老/异常数据按布尔或默认放行
    const enabled =
      item == null
        ? defaultSettings.notification[notification.source]?.enabled
        : typeof item === 'boolean'
          ? item
          : item.enabled

    if (enabled) {
      void this.queue.add(notification)
    }
  }

  /**
   * 设置通知点击事件处理
   */
  private setupNotificationClickHandler(): void {
    // Register an event listener for notification clicks
    window.electron.ipcRenderer.on('notification-click', (_event, notification: Notification) => {
      // 根据通知类型处理点击事件
      if (notification.type === 'action') {
        notification.onClick?.()
      }
    })
  }

  /**
   * 清空通知队列
   */
  public clear(): void {
    this.queue.clear()
  }

  /**
   * 获取队列中等待的通知数量
   */
  public get pendingCount(): number {
    return this.queue.pending
  }
}
