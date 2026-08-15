import { DeleteOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { restoreFromS3 } from '@renderer/services/BackupService'
import type { S3Config } from '@renderer/types'
import { formatFileSize } from '@renderer/utils'
import { Button, Modal, Space, Table, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
interface BackupFile {
  fileName: string
  modifiedTime: string
  size: number
}

interface S3BackupManagerProps {
  visible: boolean
  onClose: () => void
  s3Config: Partial<S3Config>
  restoreMethod?: (fileName: string) => Promise<void>
}

export function S3BackupManager({ visible, onClose, s3Config, restoreMethod }: S3BackupManagerProps) {
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
  const { endpoint, region, bucket, accessKeyId, secretAccessKey } = s3Config

  const fetchBackupFiles = useCallback(async () => {
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      window.toast.error('请填写完整的 S3 配置信息')
      return
    }

    setLoading(true)
    try {
      const files = await window.api.backup.listS3Files({
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
      })
      setBackupFiles(files)
      setPagination((prev) => ({
        ...prev,
        total: files.length
      }))
    } catch (error: any) {
      window.toast.error(`获取备份文件列表失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [endpoint, region, bucket, accessKeyId, secretAccessKey, s3Config])

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
      window.toast.warning('请选择要删除的备份文件')
      return
    }

    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      window.toast.error('请填写完整的 S3 配置信息')
      return
    }

    window.modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 个备份文件吗？此操作不可撤销。`,
      okText: '确认删除',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          // 依次删除选中的文件
          for (const key of selectedRowKeys) {
            await window.api.backup.deleteS3File(key.toString(), {
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
            })
          }
          window.toast.success(`成功删除 ${selectedRowKeys.length} 个备份文件`)
          setSelectedRowKeys([])
          await fetchBackupFiles()
        } catch (error: any) {
          window.toast.error(`删除备份文件失败: ${error.message}`)
        } finally {
          setDeleting(false)
        }
      }
    })
  }

  const handleDeleteSingle = async (fileName: string) => {
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      window.toast.error('请填写完整的 S3 配置信息')
      return
    }

    window.modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除备份文件 "${fileName}" 吗？此操作不可撤销。`,
      okText: '确认删除',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        setDeleting(true)
        try {
          await window.api.backup.deleteS3File(fileName, {
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
          })
          window.toast.success('删除备份文件成功')
          await fetchBackupFiles()
        } catch (error: any) {
          window.toast.error(`删除备份文件失败: ${error.message}`)
        } finally {
          setDeleting(false)
        }
      }
    })
  }

  const handleRestore = async (fileName: string) => {
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      window.toast.error('请填写完整的 S3 配置信息')
      return
    }

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
          await (restoreMethod || restoreFromS3)(fileName)
          window.toast.success('数据恢复成功')
          onClose() // 关闭模态框
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
        {`删除选中 (${selectedRowKeys.length})`}
      </Button>
      <Button key="close" onClick={onClose}>
        {'关闭'}
      </Button>
    </Space>
  )

  return (
    <Modal
      title={'S3 备份文件管理'}
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
