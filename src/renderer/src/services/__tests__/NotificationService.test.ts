import { NotificationQueue } from '@renderer/queue/NotificationQueue'
import { NotificationService } from '@renderer/services/NotificationService'
import store from '@renderer/store'
import { setNotificationSettings } from '@renderer/store/settings'
import type { Notification, NotificationSource } from '@renderer/types/notification'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const makeNotification = (source: NotificationSource): Notification => ({
  id: 'n1',
  type: 'success',
  title: 't',
  message: 'm',
  timestamp: Date.now(),
  source
})

describe('NotificationService 按新 { enabled } 结构拦截', () => {
  let addSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addSpy = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(NotificationQueue.getInstance(), 'add').mockImplementation(addSpy)
    // 重置为默认
    store.dispatch(
      setNotificationSettings({
        assistant: { enabled: false, sound: 'default' },
        backup: { enabled: false, sound: 'default' },
        update: { enabled: false, sound: 'default' },
        automation: { enabled: true, sound: 'default' },
        paint: { enabled: false, sound: 'default' }
      })
    )
  })

  it('enabled=true 的源放行进队列', async () => {
    const svc = NotificationService.getInstance()
    await svc.send(makeNotification('automation'))
    expect(addSpy).toHaveBeenCalledTimes(1)
  })

  it('enabled=false 的源被拦截（不进队列）', async () => {
    const svc = NotificationService.getInstance()
    await svc.send(makeNotification('paint'))
    expect(addSpy).not.toHaveBeenCalled()
  })

  it('开启 paint 后放行', async () => {
    store.dispatch(
      setNotificationSettings({
        assistant: { enabled: false, sound: 'default' },
        backup: { enabled: false, sound: 'default' },
        update: { enabled: false, sound: 'default' },
        automation: { enabled: true, sound: 'default' },
        paint: { enabled: true, sound: 'custom:C:\\a.mp3' }
      })
    )
    const svc = NotificationService.getInstance()
    await svc.send(makeNotification('paint'))
    expect(addSpy).toHaveBeenCalledTimes(1)
  })
})
