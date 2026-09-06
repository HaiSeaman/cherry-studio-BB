import type { UnknownAction } from '@reduxjs/toolkit'
import { startAutoSync, stopAutoSync } from '@renderer/services/BackupService'
import { useAppDispatch } from '@renderer/store'
import { useState } from 'react'

type BackupType = 'webdav' | 's3' | 'local'

/**
 * 本地备份 / WebDAV / S3 三份设置页共用的状态逻辑：
 * 自动同步间隔、最大备份数、备份文件管理弹窗开关。
 * 各页只传入自己的 settings action 与 BackupType。
 */
export function useBackupSettings(options: {
  syncInterval: number
  maxBackups: number
  setSyncIntervalAction: (value: number) => UnknownAction
  setMaxBackupsAction: (value: number) => UnknownAction
  setAutoSyncAction: (checked: boolean) => UnknownAction
  channel: BackupType
}) {
  const dispatch = useAppDispatch()
  const [syncInterval, setSyncInterval] = useState<number>(options.syncInterval)
  const [maxBackups, setMaxBackups] = useState<number>(options.maxBackups)
  const [backupManagerVisible, setBackupManagerVisible] = useState(false)

  const onSyncIntervalChange = (value: number) => {
    setSyncInterval(value)
    dispatch(options.setSyncIntervalAction(value))
    if (value === 0) {
      dispatch(options.setAutoSyncAction(false))
      stopAutoSync(options.channel)
    } else {
      dispatch(options.setAutoSyncAction(true))
      startAutoSync(false, options.channel)
    }
  }

  const onMaxBackupsChange = (value: number) => {
    setMaxBackups(value)
    dispatch(options.setMaxBackupsAction(value))
  }

  const showBackupManager = () => setBackupManagerVisible(true)
  const closeBackupManager = () => setBackupManagerVisible(false)

  return {
    syncInterval,
    maxBackups,
    backupManagerVisible,
    onSyncIntervalChange,
    onMaxBackupsChange,
    showBackupManager,
    closeBackupManager
  }
}
