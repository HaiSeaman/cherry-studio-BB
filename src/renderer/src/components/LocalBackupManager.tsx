import { DeleteOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { restoreFromLocal } from '@renderer/services/BackupService'
import { formatFileSize } from '@renderer/utils'
import { Button, message, Modal, Space, Table, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
interface BackupFile {
  fileName: string
  modifiedTime: string
  size: number
}

interface LocalBackupManagerProps {
  visible: boolean
  onClose: () => void
  localBackupDir?: string
  restoreMethod?: (fileName: string) => Promise<void>
}

export function LocalBackupManager({ visible, onClose, localBackupDir, restoreMethod }: LocalBackupManagerProps) {
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [deleting, setDeleting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 5,
    total: 0
  })
  const fetchBackupFiles = useCallback(async () => {
    if (!localBackupDir) {
      return
    }

    setLoading(true)
    try {
      const files = await window.api.backup.listLocalBackupFiles(localBackupDir)
      setBackupFiles(files)
      setPagination((prev) => ({
        ...prev,
        total: files.length
      }))
    } catch (error: any) {
      window.toast.error(`${'获取备份文件失败'}: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [localBackupDir])

  useEffect(() => {
    if (visible) {
      void fetchBackupFiles()
      setSelectedRowKeys([])
      setPagination((prev) => ({
        ...prev,
        current: 1
      }))
    }
  }, [visible, fetchBackupFiles])

  const handleTableChange = (pagination: any) => {
    setPagination(pagination)
  }

  const handleDeleteSelected = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的备份文件')
      return
    }

    if (!localBackupDir) {
      return
    }

    window.modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 个备份文件吗？此操作无法撤销。`,
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          // Delete selected files one by one
          for (const key of selectedRowKeys) {
            await window.api.backup.deleteLocalBackupFile(key.toString(), localBackupDir)
          }
          window.toast.success(`已删除 ${selectedRowKeys.length} 个备份文件`)
          setSelectedRowKeys([])
          await fetchBackupFiles()
        } catch (error: any) {
          window.toast.error(`${'删除失败'}: ${error.message}`)
        } finally {
          setDeleting(false)
        }
      }
    })
  }

  const handleDeleteSingle = async (fileName: string) => {
    if (!localBackupDir) {
      return
    }

    window.modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除备份文件 "${fileName}" 吗？此操作无法撤销。`,
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          await window.api.backup.deleteLocalBackupFile(fileName, localBackupDir)
          message.success('删除成功')
          await fetchBackupFiles()
        } catch (error: any) {
          window.toast.error(`${'删除失败'}: ${error.message}`)
        } finally {
          setDeleting(false)
        }
      }
    })
  }

  const handleRestore = async (fileName: string) => {
    if (!localBackupDir) {
      return
    }

    window.modal.confirm({
      title: '确认恢复',
      icon: <ExclamationCircleOutlined />,
      content: '从本地备份恢复将会覆盖当前数据，是否继续？',
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setRestoring(true)
        try {
          await (restoreMethod || restoreFromLocal)(fileName)
          message.success('恢复成功，应用将很快刷新')
          onClose() // Close the modal
        } catch (error: any) {
          window.toast.error(`${'恢复失败'}: ${error.message}`)
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
      ellipsis: {
        showTitle: false
      },
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
      title: '大小',
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

  const footerContent = (
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
        {'删除选中'} ({selectedRowKeys.length})
      </Button>
      <Button key="close" onClick={onClose}>
        {'关闭'}
      </Button>
    </Space>
  )

  return (
    <Modal
      title={'备份文件管理'}
      open={visible}
      onCancel={onClose}
      width={800}
      centered
      transitionName="animation-move-down"
      footer={footerContent}>
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
