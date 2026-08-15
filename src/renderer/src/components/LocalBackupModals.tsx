import { loggerService } from '@logger'
import { backupToLocal } from '@renderer/services/BackupService'
import { Button, Input, Modal } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useState } from 'react'
interface LocalBackupModalProps {
  isModalVisible: boolean
  handleBackup: () => void
  handleCancel: () => void
  backuping: boolean
  customFileName: string
  setCustomFileName: (value: string) => void
}

const logger = loggerService.withContext('LocalBackupModal')

export function LocalBackupModal({
  isModalVisible,
  handleBackup,
  handleCancel,
  backuping,
  customFileName,
  setCustomFileName
}: LocalBackupModalProps) {
  return (
    <Modal
      title={'本地备份'}
      open={isModalVisible}
      onOk={handleBackup}
      onCancel={handleCancel}
      footer={[
        <Button key="back" onClick={handleCancel}>
          {'取消'}
        </Button>,
        <Button key="submit" type="primary" loading={backuping} onClick={handleBackup}>
          {'确认'}
        </Button>
      ]}>
      <Input
        value={customFileName}
        onChange={(e) => setCustomFileName(e.target.value)}
        placeholder={'请输入备份文件名'}
      />
    </Modal>
  )
}

// Hook for backup modal
export function useLocalBackupModal(localBackupDir: string | undefined) {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [backuping, setBackuping] = useState(false)
  const [customFileName, setCustomFileName] = useState('')

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

  const handleBackup = async () => {
    if (!localBackupDir) {
      setIsModalVisible(false)
      return
    }

    setBackuping(true)
    try {
      await backupToLocal({
        showMessage: true,
        customFileName: customFileName || undefined
      })
      setIsModalVisible(false)
    } catch (error) {
      logger.error('Backup failed:', error as Error)
    } finally {
      setBackuping(false)
    }
  }

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
