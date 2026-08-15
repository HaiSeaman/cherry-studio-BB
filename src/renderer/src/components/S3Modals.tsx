import { backupToS3 } from '@renderer/services/BackupService'
import { formatFileSize } from '@renderer/utils'
import { Input, Modal, Select, Spin } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useState } from 'react'
interface BackupFile {
  fileName: string
  modifiedTime: string
  size: number
}

export function useS3BackupModal() {
  const [customFileName, setCustomFileName] = useState('')
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [backuping, setBackuping] = useState(false)

  const handleBackup = async () => {
    setBackuping(true)
    try {
      await backupToS3({ customFileName, showMessage: true })
    } finally {
      setBackuping(false)
      setIsModalVisible(false)
    }
  }

  const handleCancel = () => {
    setIsModalVisible(false)
  }

  const showBackupModal = useCallback(async () => {
    // 获取默认文件名
    const deviceType = await window.api.system.getDeviceType()
    const hostname = await window.api.system.getHostname()
    const timestamp = dayjs().format('YYYYMMDDHHmmss')
    const defaultFileName = `cherry-studio.${timestamp}.${hostname}.${deviceType}.zip`
    setCustomFileName(defaultFileName)
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

type S3BackupModalProps = {
  isModalVisible: boolean
  handleBackup: () => Promise<void>
  handleCancel: () => void
  backuping: boolean
  customFileName: string
  setCustomFileName: (value: string) => void
}

export function S3BackupModal({
  isModalVisible,
  handleBackup,
  handleCancel,
  backuping,
  customFileName,
  setCustomFileName
}: S3BackupModalProps) {
  return (
    <Modal
      title={'S3 备份'}
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

interface UseS3RestoreModalProps {
  endpoint: string | undefined
  region: string | undefined
  bucket: string | undefined
  accessKeyId: string | undefined
  secretAccessKey: string | undefined
  root?: string | undefined
}

export function useS3RestoreModal({
  endpoint,
  region,
  bucket,
  accessKeyId,
  secretAccessKey,
  root
}: UseS3RestoreModalProps) {
  const [isRestoreModalVisible, setIsRestoreModalVisible] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([])
  const showRestoreModal = useCallback(async () => {
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      window.toast.error('请填写完整的 S3 配置信息')
      return
    }

    setIsRestoreModalVisible(true)
    setLoadingFiles(true)
    try {
      const files = await window.api.backup.listS3Files({
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
        root,
        autoSync: false,
        syncInterval: 0,
        maxBackups: 0,
        skipBackupFile: false
      })
      setBackupFiles(files)
    } catch (error: any) {
      window.toast.error(`获取备份文件列表失败: ${error.message}`)
    } finally {
      setLoadingFiles(false)
    }
  }, [endpoint, region, bucket, accessKeyId, secretAccessKey, root])

  const handleRestore = useCallback(async () => {
    if (!selectedFile || !endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      window.toast.error(!selectedFile ? '请选择要恢复的备份文件' : '请填写完整的 S3 配置信息')
      return
    }

    window.modal.confirm({
      title: '确认恢复数据',
      content: '恢复数据将覆盖当前所有数据，此操作不可撤销。确定要继续吗？',
      okText: '确认恢复',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setRestoring(true)
        try {
          await window.api.backup.restoreFromS3({
            endpoint,
            region,
            bucket,
            accessKeyId,
            secretAccessKey,
            root,
            fileName: selectedFile,
            autoSync: false,
            syncInterval: 0,
            maxBackups: 0,
            skipBackupFile: false
          })
          window.toast.success('恢复成功')
          setIsRestoreModalVisible(false)
        } catch (error: any) {
          window.toast.error(`数据恢复失败: ${error.message}`)
        } finally {
          setRestoring(false)
        }
      }
    })
  }, [selectedFile, endpoint, region, bucket, accessKeyId, secretAccessKey, root])

  const handleCancel = () => {
    setIsRestoreModalVisible(false)
  }

  return {
    isRestoreModalVisible,
    handleRestore,
    handleCancel,
    restoring,
    selectedFile,
    setSelectedFile,
    loadingFiles,
    backupFiles,
    showRestoreModal
  }
}

type S3RestoreModalProps = ReturnType<typeof useS3RestoreModal>

export function S3RestoreModal({
  isRestoreModalVisible,
  handleRestore,
  handleCancel,
  restoring,
  selectedFile,
  setSelectedFile,
  loadingFiles,
  backupFiles
}: S3RestoreModalProps) {
  return (
    <Modal
      title={'S3 数据恢复'}
      open={isRestoreModalVisible}
      onOk={handleRestore}
      onCancel={handleCancel}
      okButtonProps={{ loading: restoring }}
      width={600}
      transitionName="animation-move-down"
      centered>
      <div style={{ position: 'relative' }}>
        <Select
          style={{ width: '100%' }}
          placeholder={'请选择要恢复的备份文件'}
          value={selectedFile}
          onChange={setSelectedFile}
          options={backupFiles.map(formatFileOption)}
          loading={loadingFiles}
          showSearch
          filterOption={(input, option) =>
            typeof option?.label === 'string' ? option.label.toLowerCase().includes(input.toLowerCase()) : false
          }
        />
        {loadingFiles && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <Spin />
          </div>
        )}
      </div>
    </Modal>
  )
}

function formatFileOption(file: BackupFile) {
  const date = dayjs(file.modifiedTime).format('YYYY-MM-DD HH:mm:ss')
  const size = formatFileSize(file.size)
  return {
    label: `${file.fileName} (${date}, ${size})`,
    value: file.fileName
  }
}
