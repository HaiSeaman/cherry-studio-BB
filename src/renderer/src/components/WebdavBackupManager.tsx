import { DeleteOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { restoreFromWebdav } from '@renderer/services/BackupService'
import { formatFileSize } from '@renderer/utils'
import { Button, message, Modal, Table, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
interface BackupFile {
  fileName: string
  modifiedTime: string
  size: number
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
  restoreMethod?: (fileName: string) => Promise<void>
  customLabels?: {
    restoreConfirmTitle?: string
    restoreConfirmContent?: string
    invalidConfigMessage?: string
  }
}

export function WebdavBackupManager({
  visible,
  onClose,
  webdavConfig,
  restoreMethod,
  customLabels
}: WebdavBackupManagerProps) {
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

  const { webdavHost, webdavUser, webdavPass, webdavPath } = webdavConfig

  const fetchBackupFiles = useCallback(async () => {
    if (!webdavHost) {
      window.toast.error('无效的 WebDAV 设置')
      return
    }

    setLoading(true)
    try {
      const files = await window.api.backup.listWebdavFiles({
        webdavHost,
        webdavUser,
        webdavPass,
        webdavPath
      } as WebdavConfig)
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
  }, [webdavHost, webdavUser, webdavPass, webdavPath])

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

    if (!webdavHost) {
      window.toast.error('无效的 WebDAV 设置')
      return
    }

    window.modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 个备份文件吗？此操作不可恢复`,
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          // 依次删除选中的文件
          for (const key of selectedRowKeys) {
            await window.api.backup.deleteWebdavFile(key.toString(), {
              webdavHost,
              webdavUser,
              webdavPass,
              webdavPath
            } as WebdavConfig)
          }
          window.toast.success(`成功删除 ${selectedRowKeys.length} 个备份文件`)
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
    if (!webdavHost) {
      window.toast.error('无效的 WebDAV 设置')
      return
    }

    window.modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除备份文件 "${fileName}" 吗？此操作不可恢复`,
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          await window.api.backup.deleteWebdavFile(fileName, {
            webdavHost,
            webdavUser,
            webdavPass,
            webdavPath
          } as WebdavConfig)
          window.toast.success('删除成功')
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
    if (!webdavHost) {
      window.toast.error(customLabels?.invalidConfigMessage || '无效的 WebDAV 设置')
      return
    }

    window.modal.confirm({
      title: customLabels?.restoreConfirmTitle || '确认恢复',
      icon: <ExclamationCircleOutlined />,
      content: customLabels?.restoreConfirmContent || '从 WebDAV 恢复将会覆盖当前数据，是否继续？',
      okText: '确认',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setRestoring(true)
        try {
          await (restoreMethod || restoreFromWebdav)(fileName)
          window.toast.success('恢复成功，应用将在几秒后刷新')
          onClose() // 关闭模态框
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

  return (
    <Modal
      title={'备份数据管理'}
      open={visible}
      onCancel={onClose}
      width={800}
      centered
      transitionName="animation-move-down"
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchBackupFiles} disabled={loading}>
          {'刷新'}
        </Button>,
        <Button
          key="delete"
          danger
          icon={<DeleteOutlined />}
          onClick={handleDeleteSelected}
          disabled={selectedRowKeys.length === 0 || deleting}
          loading={deleting}>
          {'删除选中'} ({selectedRowKeys.length})
        </Button>,
        <Button key="close" onClick={onClose}>
          {'关闭'}
        </Button>
      ]}>
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
