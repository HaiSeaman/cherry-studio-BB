export interface BackupSelectOption {
  label: string
  value: number
}

/** 自动同步/备份间隔选项（分钟） */
export const BACKUP_SYNC_INTERVAL_OPTIONS: BackupSelectOption[] = [
  { label: '关闭', value: 0 },
  { label: '1 分钟', value: 1 },
  { label: '5 分钟', value: 5 },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '1 小时', value: 60 },
  { label: '2 小时', value: 120 },
  { label: '6 小时', value: 360 },
  { label: '12 小时', value: 720 },
  { label: '24 小时', value: 1440 }
]

/** 最大备份保留份数选项 */
export const BACKUP_MAX_KEEP_OPTIONS: BackupSelectOption[] = [
  { label: '无限制', value: 0 },
  { label: '1', value: 1 },
  { label: '3', value: 3 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 }
]
