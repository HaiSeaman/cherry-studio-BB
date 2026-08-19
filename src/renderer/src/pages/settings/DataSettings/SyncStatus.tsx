import { SyncOutlined, WarningOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import { Tooltip } from 'antd'
import dayjs from 'dayjs'

interface SyncStatusProps {
  sync: { lastSyncTime?: number | null; syncing: boolean; lastSyncError?: string | null } | undefined
  /** 从未同步过时的占位文案，如「等待下次备份」「未同步」 */
  emptyLabel: string
  /** 上次同步时间完整文案（含冒号与空格），如「上次备份: 」 */
  syncedLabel: string
  /** 同步错误 tooltip 前缀，如「备份错误」 */
  errorLabel: string
}

/** 备份/同步状态展示：同步中转圈、出错红色告警、上次时间。Local/WebDAV/S3 三家共用 */
export function SyncStatus({ sync, emptyLabel, syncedLabel, errorLabel }: SyncStatusProps) {
  if (!sync?.lastSyncTime && !sync?.syncing && !sync?.lastSyncError) {
    return <span style={{ color: 'var(--text-secondary)' }}>{emptyLabel}</span>
  }
  return (
    <HStack gap="5px" alignItems="center">
      {sync.syncing && <SyncOutlined spin />}
      {!sync.syncing && sync.lastSyncError && (
        <Tooltip title={`${errorLabel}: ${sync.lastSyncError}`}>
          <WarningOutlined style={{ color: 'red' }} />
        </Tooltip>
      )}
      {sync.lastSyncTime && (
        <span style={{ color: 'var(--text-secondary)' }}>
          {`${syncedLabel}${dayjs(sync.lastSyncTime).format('HH:mm:ss')}`}
        </span>
      )}
    </HStack>
  )
}
