import { loggerService } from '@logger'
import { DeleteOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  backupToLocal,
  backupToS3,
  backupToWebdav,
  restoreFromLocal,
  restoreFromS3,
  restoreFromWebdav
} from '@renderer/services/BackupService'
import type { S3Config } from '@renderer/types'
import { formatFileSize } from '@renderer/utils'
import { Button, Input, Modal, Space, Table, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useRef, useState } from 'react'

const logger = loggerService.withContext('BackupManager')

interface BackupFile {
  fileName: string
  modifiedTime: string
  size: number
}

interface BackupManagerProps {
  visible: boolean
  onClose: () => void
  title: string
  listFiles: () => Promise<BackupFile[]>
  deleteFile: (fileName: string) => Promise<void>
  restoreFile: (fileName: string) => Promise<unknown>
  /** 配置不完整时中止所有操作；提供 invalidConfigMessage 时给出提示 */
  isConfigValid?: boolean
  invalidConfigMessage?: string
}

/** 通用备份文件管理弹窗：列表 + 删除 + 恢复 */
export function BackupManager({
  visible,
  onClose,
  title,
  listFiles,
  deleteFile,
  restoreFile,
  isConfigValid = true,
  invalidConfigMessage
}: BackupManagerProps) {
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [deleting, setDeleting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 5, total: 0 })

  const guard = useCallback(() => {
    if (isConfigValid) return true
    if (invalidConfigMessage) window.toast.error(invalidConfigMessage)
    return false
  }, [isConfigValid, invalidConfigMessage])

  const fetchBackupFiles = useCallback(async () => {
    if (!guard()) return

    setLoading(true)
    try {
      const files = await listFiles()
      setBackupFiles(files)
      setPagination((prev) => ({ ...prev, total: files.length }))
    } catch (error: any) {
      window.toast.error(`获取备份文件列表失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [guard, listFiles])

  // ponytail: latest-ref —— listFiles 是包装层每次渲染的新闭包，
  // 弹窗打开期间父组件无关重渲染不应触发重新拉取，故 effect 只依赖 visible
  const fetchRef = useRef(fetchBackupFiles)
  fetchRef.current = fetchBackupFiles

  useEffect(() => {
    if (visible) {
      void fetchRef.current()
      setSelectedRowKeys([])
      setPagination((prev) => ({ ...prev, current: 1 }))
    }
  }, [visible])

  const handleTableChange = (pagination: any) => {
    setPagination(pagination)
  }

  const confirmDelete = (content: string, onOk: () => Promise<void>) => {
    window.modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content,
      okText: '确认删除',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          await onOk()
          await fetchBackupFiles()
        } catch (error: any) {
          window.toast.error(`删除备份文件失败: ${error.message}`)
        } finally {
          setDeleting(false)
        }
      }
    })
  }

  const handleDeleteSelected = () => {
    if (selectedRowKeys.length === 0) {
      window.toast.warning('请选择要删除的备份文件')
      return
    }
    if (!guard()) return

    confirmDelete(`确定要删除选中的 ${selectedRowKeys.length} 个备份文件吗？此操作不可撤销。`, async () => {
      for (const key of selectedRowKeys) {
        await deleteFile(key.toString())
      }
      window.toast.success(`成功删除 ${selectedRowKeys.length} 个备份文件`)
      setSelectedRowKeys([])
    })
  }

  const handleDeleteSingle = (fileName: string) => {
    if (!guard()) return

    confirmDelete(`确定要删除备份文件 "${fileName}" 吗？此操作不可撤销。`, async () => {
      await deleteFile(fileName)
      window.toast.success('删除成功')
    })
  }

  const handleRestore = (fileName: string) => {
    if (!guard()) return

    window.modal.confirm({
      title: '确认恢复数据',
      icon: <ExclamationCircleOutlined />,
      content: '恢复数据将覆盖当前所有数据，此操作不可撤销。确定要继续吗？',
      okText: '确认恢复',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setRestoring(true)
        try {
          await restoreFile(fileName)
          window.toast.success('恢复成功，应用将在几秒后刷新')
          onClose()
        } catch (error: any) {
          window.toast.error(`数据恢复失败: ${error.message}`)
        } finally {
          setRestoring(false)
        }
      }
    })
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: { showTitle: false },
      render: (fileName: string) => (
        <Tooltip placement="topLeft" title={fileName}>
          {fileName}
        </Tooltip>
      )
    },
    {
      title: '修改时间',
      dataIndex: 'modifiedTime',
      key: 'modifiedTime',
      width: 180,
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '文件大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      render: (size: number) => formatFileSize(size)
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: BackupFile) => (
        <>
          <Button type="link" onClick={() => handleRestore(record.fileName)} disabled={restoring || deleting}>
            {'恢复'}
          </Button>
          <Button
            type="link"
            danger
            onClick={() => handleDeleteSingle(record.fileName)}
            disabled={deleting || restoring}>
            {'删除'}
          </Button>
        </>
      )
    }
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(selectedRowKeys)
    }
  }

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      width={800}
      centered
      transitionName="animation-move-down"
      footer={
        <Space align="center">
          <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchBackupFiles} disabled={loading}>
            {'刷新'}
          </Button>
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            onClick={handleDeleteSelected}
            disabled={selectedRowKeys.length === 0 || deleting}
            loading={deleting}>
            {`删除选中 (${selectedRowKeys.length})`}
          </Button>
          <Button key="close" onClick={onClose}>
            {'关闭'}
          </Button>
        </Space>
      }>
      <Table
        rowKey="fileName"
        columns={columns}
        dataSource={backupFiles}
        rowSelection={rowSelection}
        pagination={pagination}
        loading={loading}
        onChange={handleTableChange}
        size="middle"
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// 备份文件名输入弹窗（通用）
// ---------------------------------------------------------------------------

type BackupMethod = (options: { showMessage?: boolean; customFileName?: string }) => Promise<void>

/** 打开时生成默认备份文件名，确认后执行备份 */
export function useBackupModal(backupMethod: BackupMethod) {
  const [customFileName, setCustomFileName] = useState('')
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [backuping, setBackuping] = useState(false)

  const handleBackup = async () => {
    setBackuping(true)
    try {
      await backupMethod({ showMessage: true, customFileName: customFileName || undefined })
      setIsModalVisible(false)
    } catch (error) {
      // 失败保持弹窗打开便于重试；错误提示由 BackupService 内部完成（modal/toast），此处仅记录日志
      logger.error('[BackupManager] backup failed:', error as Error)
    } finally {
      setBackuping(false)
    }
  }

  const handleCancel = () => {
    setIsModalVisible(false)
  }

  const showBackupModal = useCallback(async () => {
    const deviceType = await window.api.system.getDeviceType()
    const hostname = await window.api.system.getHostname()
    const timestamp = dayjs().format('YYYYMMDDHHmmss')
    setCustomFileName(`cherry-studio.${timestamp}.${hostname}.${deviceType}.zip`)
    setIsModalVisible(true)
  }, [])

  return {
    isModalVisible,
    handleBackup,
    handleCancel,
    backuping,
    customFileName,
    setCustomFileName,
    showBackupModal
  }
}

interface BackupFileNameModalProps {
  isModalVisible: boolean
  handleBackup: () => Promise<void> | void
  handleCancel: () => void
  backuping: boolean
  customFileName: string
  setCustomFileName: (value: string) => void
  title: string
}

export function BackupFileNameModal({
  isModalVisible,
  handleBackup,
  handleCancel,
  backuping,
  customFileName,
  setCustomFileName,
  title
}: BackupFileNameModalProps) {
  return (
    <Modal
      title={title}
      open={isModalVisible}
      onOk={handleBackup}
      onCancel={handleCancel}
      okButtonProps={{ loading: backuping }}
      transitionName="animation-move-down"
      centered>
      <Input
        value={customFileName}
        onChange={(e) => setCustomFileName(e.target.value)}
        placeholder={'请输入备份文件名'}
      />
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// S3 / WebDAV / 本地 三组薄包装（保持原有导出名）
// ---------------------------------------------------------------------------

interface S3BackupManagerProps {
  visible: boolean
  onClose: () => void
  s3Config: Partial<S3Config>
}

export function S3BackupManager({ visible, onClose, s3Config }: S3BackupManagerProps) {
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = s3Config
  const config = {
    ...s3Config,
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    skipBackupFile: false,
    autoSync: false,
    syncInterval: 0,
    maxBackups: 0
  } as S3Config
  return (
    <BackupManager
      visible={visible}
      onClose={onClose}
      title={'S3 备份文件管理'}
      isConfigValid={Boolean(endpoint && region && bucket && accessKeyId && secretAccessKey)}
      invalidConfigMessage={'请填写完整的 S3 配置信息'}
      listFiles={() => window.api.backup.listS3Files(config)}
      deleteFile={(fileName) => window.api.backup.deleteS3File(fileName, config)}
      restoreFile={restoreFromS3}
    />
  )
}

export const useS3BackupModal = () => useBackupModal(backupToS3)

export function S3BackupModal(props: Omit<BackupFileNameModalProps, 'title'>) {
  return <BackupFileNameModal {...props} title={'S3 备份'} />
}

interface WebdavConfig {
  webdavHost: string
  webdavUser?: string
  webdavPass?: string
  webdavPath?: string
}

interface WebdavBackupManagerProps {
  visible: boolean
  onClose: () => void
  webdavConfig: {
    webdavHost?: string
    webdavUser?: string
    webdavPass?: string
    webdavPath?: string
    webdavDisableStream?: boolean
  }
}

export function WebdavBackupManager({ visible, onClose, webdavConfig }: WebdavBackupManagerProps) {
  const { webdavHost, webdavUser, webdavPass, webdavPath } = webdavConfig
  const config = { webdavHost, webdavUser, webdavPass, webdavPath } as WebdavConfig
  return (
    <BackupManager
      visible={visible}
      onClose={onClose}
      title={'备份数据管理'}
      isConfigValid={Boolean(webdavHost)}
      invalidConfigMessage={'无效的 WebDAV 设置'}
      listFiles={() => window.api.backup.listWebdavFiles(config)}
      deleteFile={(fileName) => window.api.backup.deleteWebdavFile(fileName, config)}
      restoreFile={restoreFromWebdav}
    />
  )
}

export const useWebdavBackupModal = () => useBackupModal(backupToWebdav)

export function WebdavBackupModal(props: Omit<BackupFileNameModalProps, 'title'>) {
  return <BackupFileNameModal {...props} title={'备份到 WebDAV'} />
}

interface LocalBackupManagerProps {
  visible: boolean
  onClose: () => void
  localBackupDir?: string
}

export function LocalBackupManager({ visible, onClose, localBackupDir }: LocalBackupManagerProps) {
  return (
    <BackupManager
      visible={visible}
      onClose={onClose}
      title={'备份文件管理'}
      isConfigValid={Boolean(localBackupDir)}
      listFiles={async () => (localBackupDir ? window.api.backup.listLocalBackupFiles(localBackupDir) : [])}
      deleteFile={async (fileName) => {
        if (localBackupDir) await window.api.backup.deleteLocalBackupFile(fileName, localBackupDir)
      }}
      restoreFile={restoreFromLocal}
    />
  )
}

export function useLocalBackupModal(localBackupDir: string | undefined) {
  const modal = useBackupModal(backupToLocal)
  const handleBackup = async () => {
    if (!localBackupDir) {
      modal.handleCancel()
      return
    }
    await modal.handleBackup()
  }
  return { ...modal, handleBackup }
}

export function LocalBackupModal(props: Omit<BackupFileNameModalProps, 'title'>) {
  return <BackupFileNameModal {...props} title={'本地备份'} />
}
