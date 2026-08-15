import { loggerService } from '@logger'
import store from '@renderer/store'
import type { Topic } from '@renderer/types'
import type { Message } from '@renderer/types/newMessage'
import {
  exportMarkdownToObsidian,
  messagesToMarkdown,
  messageToMarkdown,
  messageToMarkdownWithReasoning,
  topicToMarkdown
} from '@renderer/utils/export'
import { Alert, Empty, Form, Input, Modal, Select, Spin, Switch, TreeSelect } from 'antd'
import React, { useEffect, useState } from 'react'

const logger = loggerService.withContext('ObsidianExportDialog')

const { Option } = Select

interface FileInfo {
  path: string
  type: 'folder' | 'markdown'
  name: string
}

const ObsidianProcessingMethod = {
  APPEND: '1',
  PREPEND: '2',
  NEW_OR_OVERWRITE: '3'
} as const

interface PopupContainerProps {
  title: string
  obsidianTags: string | null
  processingMethod: (typeof ObsidianProcessingMethod)[keyof typeof ObsidianProcessingMethod]
  open: boolean
  resolve: (success: boolean) => void
  message?: Message
  messages?: Message[]
  topic?: Topic
  rawContent?: string
}

// 转换文件信息数组为树形结构
const convertToTreeData = (files: FileInfo[]) => {
  const treeData: any[] = [
    {
      title: '根目录',
      value: '',
      isLeaf: false,
      selectable: true
    }
  ]

  // 记录已创建的节点路径
  const pathMap: Record<string, any> = {
    '': treeData[0]
  }

  // 先按类型分组，确保先处理文件夹
  const folders = files.filter((file) => file.type === 'folder')
  const mdFiles = files.filter((file) => file.type === 'markdown')

  // 按路径排序，确保父文件夹先被创建
  const sortedFolders = [...folders].sort((a, b) => a.path.split('/').length - b.path.split('/').length)

  // 先处理所有文件夹，构建目录结构
  for (const folder of sortedFolders) {
    const parts = folder.path.split('/')
    let currentPath = ''
    let parentPath = ''

    // 遍历文件夹路径的每一部分，确保创建完整路径
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]

      // 构建当前路径
      currentPath = currentPath ? `${currentPath}/${part}` : part

      // 如果这个路径节点还没创建
      if (!pathMap[currentPath]) {
        const node = {
          title: part,
          value: currentPath,
          key: currentPath,
          isLeaf: false,
          selectable: true,
          children: []
        }

        // 获取父节点，将当前节点添加到父节点的children中
        const parentNode = pathMap[parentPath]
        if (parentNode) {
          if (!parentNode.children) {
            parentNode.children = []
          }
          parentNode.children.push(node)
        }

        pathMap[currentPath] = node
      }

      // 更新父路径为当前路径，为下一级做准备
      parentPath = currentPath
    }
  }

  // 然后处理md文件
  for (const file of mdFiles) {
    const fullPath = file.path
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'))
    const fileName = file.name

    // 获取父文件夹节点
    const parentNode = pathMap[dirPath] || pathMap['']

    // 创建文件节点
    const fileNode = {
      title: fileName,
      value: fullPath,
      isLeaf: true,
      selectable: true,
      icon: <span style={{ marginRight: 4 }}>📄</span>
    }

    // 添加到父节点
    if (!parentNode.children) {
      parentNode.children = []
    }
    parentNode.children.push(fileNode)
  }

  return treeData
}

const PopupContainer: React.FC<PopupContainerProps> = ({
  title,
  obsidianTags,
  processingMethod,
  open,
  resolve,
  message,
  messages,
  topic,
  rawContent
}) => {
  const defaultObsidianVault = store.getState().settings.defaultObsidianVault
  const [state, setState] = useState({
    title,
    tags: obsidianTags || '',
    createdAt: new Date().toISOString().split('T')[0],
    source: 'Cherry Studio',
    processingMethod: processingMethod,
    folder: ''
  })
  const [hasTitleBeenManuallyEdited, setHasTitleBeenManuallyEdited] = useState(false)
  const [vaults, setVaults] = useState<Array<{ path: string; name: string }>>([])
  const [files, setFiles] = useState<FileInfo[]>([])
  const [fileTreeData, setFileTreeData] = useState<any[]>([])
  const [selectedVault, setSelectedVault] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [exportReasoning, setExportReasoning] = useState(false)

  useEffect(() => {
    if (files.length > 0) {
      const treeData = convertToTreeData(files)
      setFileTreeData(treeData)
    } else {
      setFileTreeData([
        {
          title: '根目录',
          value: '',
          isLeaf: false,
          selectable: true
        }
      ])
    }
  }, [files])

  useEffect(() => {
    const fetchVaults = async () => {
      try {
        setLoading(true)
        setError(null)
        const vaultsData = await window.api.obsidian.getVaults()
        if (vaultsData.length === 0) {
          setError('未找到 Obsidian 保管库')
          setLoading(false)
          return
        }
        setVaults(vaultsData)
        const vaultToUse = defaultObsidianVault || vaultsData[0]?.name
        if (vaultToUse) {
          setSelectedVault(vaultToUse)
          const filesData = await window.api.obsidian.getFiles(vaultToUse)
          setFiles(filesData)
        }
      } catch (error) {
        logger.error('获取Obsidian Vault失败:', error as Error)
        setError('获取 Obsidian 保管库失败')
      } finally {
        setLoading(false)
      }
    }
    void fetchVaults()
  }, [defaultObsidianVault])

  useEffect(() => {
    if (selectedVault) {
      const fetchFiles = async () => {
        try {
          setLoading(true)
          setError(null)
          const filesData = await window.api.obsidian.getFiles(selectedVault)
          setFiles(filesData)
        } catch (error) {
          logger.error('获取Obsidian文件失败:', error as Error)
          setError('获取文件夹结构失败')
        } finally {
          setLoading(false)
        }
      }
      void fetchFiles()
    }
  }, [selectedVault])

  const handleOk = async () => {
    if (!selectedVault) {
      setError('请先选择一个保管库')
      return
    }
    let markdown = ''
    if (rawContent) {
      markdown = rawContent
    } else if (topic) {
      markdown = await topicToMarkdown(topic, exportReasoning)
    } else if (messages && messages.length > 0) {
      markdown = messagesToMarkdown(messages, exportReasoning)
    } else if (message) {
      markdown = exportReasoning ? messageToMarkdownWithReasoning(message) : messageToMarkdown(message)
    } else {
      markdown = ''
    }
    let content = ''
    if (state.processingMethod !== ObsidianProcessingMethod.NEW_OR_OVERWRITE) {
      content = `\n---\n${markdown}`
    } else {
      content = `---\ntitle: ${state.title}\ncreated: ${state.createdAt}\nsource: ${state.source}\ntags: ${state.tags}\n---\n${markdown}`
    }
    if (content === '') {
      window.toast.error('导出到 Obsidian 失败')
      return
    }
    await navigator.clipboard.writeText(content)
    void exportMarkdownToObsidian({
      ...state,
      folder: state.folder,
      vault: selectedVault
    })
    setOpen(false)
    resolve(true)
  }

  const [openState, setOpen] = useState(open)
  useEffect(() => {
    setOpen(open)
  }, [open])

  const handleCancel = () => {
    setOpen(false)
    resolve(false)
  }

  const handleChange = (key: string, value: any) => {
    setState((prevState) => ({ ...prevState, [key]: value }))
  }
  const handleTitleInputChange = (newTitle: string) => {
    handleChange('title', newTitle)
    setHasTitleBeenManuallyEdited(true)
  }
  const handleVaultChange = (value: string) => {
    setSelectedVault(value)
    setState((prevState) => ({ ...prevState, folder: '' }))
  }
  const handleFileSelect = (value: string) => {
    handleChange('folder', value)
    if (value) {
      const selectedFile = files.find((file) => file.path === value)
      if (selectedFile) {
        if (selectedFile.type === 'markdown') {
          const fileName = selectedFile.name
          const titleWithoutExt = fileName.endsWith('.md') ? fileName.substring(0, fileName.length - 3) : fileName
          handleChange('title', titleWithoutExt)
          setHasTitleBeenManuallyEdited(false)
          handleChange('processingMethod', ObsidianProcessingMethod.APPEND)
        } else {
          handleChange('processingMethod', ObsidianProcessingMethod.NEW_OR_OVERWRITE)
          if (!hasTitleBeenManuallyEdited) {
            handleChange('title', title)
          }
        }
      }
    }
  }
  return (
    <Modal
      title={'配置笔记属性'}
      open={openState}
      onOk={handleOk}
      onCancel={handleCancel}
      width={600}
      closable
      maskClosable
      centered
      transitionName="animation-move-down"
      okButtonProps={{
        type: 'primary',
        disabled: vaults.length === 0 || loading || !!error
      }}
      okText={'确定'}
      afterClose={() => setOpen(open)}>
      {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
      <Form layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} labelAlign="left">
        <Form.Item label={'标题'}>
          <Input
            value={state.title}
            onChange={(e) => handleTitleInputChange(e.target.value)}
            placeholder={'请输入标题'}
          />
        </Form.Item>
        <Form.Item label={'保管库'}>
          {vaults.length > 0 ? (
            <Select
              loading={loading}
              value={selectedVault}
              onChange={handleVaultChange}
              placeholder={'请选择保管库名称'}
              style={{ width: '100%' }}>
              {vaults.map((vault) => (
                <Option key={vault.name} value={vault.name}>
                  {vault.name}
                </Option>
              ))}
            </Select>
          ) : (
            <Empty
              description={loading ? '加载中...' : '未找到 Obsidian 保管库'}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Form.Item>
        <Form.Item label={'路径'}>
          <Spin spinning={loading}>
            {selectedVault ? (
              <TreeSelect
                value={state.folder}
                onChange={handleFileSelect}
                placeholder={'请选择路径'}
                style={{ width: '100%' }}
                showSearch
                dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                treeDefaultExpandAll={false}
                treeNodeFilterProp="title"
                treeData={fileTreeData}></TreeSelect>
            ) : (
              <Empty description={'请先选择保管库'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Spin>
        </Form.Item>
        <Form.Item label={'标签'}>
          <Input
            value={state.tags}
            onChange={(e) => handleChange('tags', e.target.value)}
            placeholder={'请输入标签，多个标签用英文逗号分隔'}
          />
        </Form.Item>
        <Form.Item label={'创建时间'}>
          <Input
            value={state.createdAt}
            onChange={(e) => handleChange('createdAt', e.target.value)}
            placeholder={'请选择创建时间'}
          />
        </Form.Item>
        <Form.Item label={'来源'}>
          <Input
            value={state.source}
            onChange={(e) => handleChange('source', e.target.value)}
            placeholder={'请输入来源'}
          />
        </Form.Item>
        <Form.Item label={'处理方式'}>
          <Select
            value={state.processingMethod}
            onChange={(value) => handleChange('processingMethod', value)}
            placeholder={'请选择处理方式'}
            allowClear>
            <Option value={ObsidianProcessingMethod.APPEND}>{'追加'}</Option>
            <Option value={ObsidianProcessingMethod.PREPEND}>{'前置'}</Option>
            <Option value={ObsidianProcessingMethod.NEW_OR_OVERWRITE}>{'新建（如果存在就覆盖）'}</Option>
          </Select>
        </Form.Item>
        {!rawContent && (
          <Form.Item label={'导出思维链'}>
            <Switch checked={exportReasoning} onChange={setExportReasoning} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

export { ObsidianProcessingMethod, PopupContainer }
