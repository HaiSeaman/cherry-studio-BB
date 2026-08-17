import { loggerService } from '@logger'
import type { McpError } from '@modelcontextprotocol/sdk/types.js'
import { DeleteIcon } from '@renderer/components/Icons'
import Scrollbar from '@renderer/components/Scrollbar'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useMCPServer, useMCPServers } from '@renderer/hooks/useMCPServers'
import { useMCPServerTrust } from '@renderer/hooks/useMCPServerTrust'
import MCPDescription from '@renderer/pages/settings/MCPSettings/McpDescription'
import type { MCPPrompt, MCPResource, MCPServer, MCPTool } from '@renderer/types'
import { parseKeyValueString } from '@renderer/utils/env'
import { formatMcpError } from '@renderer/utils/error'
import type { MCPServerLogEntry } from '@shared/config/types'
import type { TabsProps } from 'antd'
import { Badge, Button, Flex, Form, Input, Modal, Radio, Select, Switch, Tabs, Tag, Typography } from 'antd'
import TextArea from 'antd/es/input/TextArea'
import { ChevronDown, SaveIcon } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import styled from 'styled-components'

import { SettingContainer, SettingDivider, SettingGroup, SettingTitle } from '..'
import MCPPromptsSection from './McpPrompt'
import MCPResourcesSection from './McpResource'
import MCPToolsSection from './McpTool'

const logger = loggerService.withContext('McpSettings')

interface MCPFormValues {
  name: string
  description?: string
  serverType: MCPServer['type']
  baseUrl?: string
  command?: string
  registryUrl?: string
  args?: string
  env?: string
  isActive: boolean
  headers?: string
  longRunning?: boolean
  timeout?: number

  provider?: string
  providerUrl?: string
  logoUrl?: string
  tags?: string[]
}

interface Registry {
  name: string
  url: string
}

const NpmRegistry: Registry[] = [
  { name: '淘宝 NPM Mirror', url: 'https://registry.npmmirror.com' },
  { name: '自定义', url: 'custom' }
]
const PipRegistry: Registry[] = [
  { name: '清华大学', url: 'https://pypi.tuna.tsinghua.edu.cn/simple' },
  { name: '阿里云', url: 'http://mirrors.aliyun.com/pypi/simple/' },
  { name: '中国科学技术大学', url: 'https://mirrors.ustc.edu.cn/pypi/simple/' },
  { name: '华为云', url: 'https://repo.huaweicloud.com/repository/pypi/simple/' },
  { name: '腾讯云', url: 'https://mirrors.cloud.tencent.com/pypi/simple/' }
]

type TabKey = 'settings' | 'description' | 'tools' | 'prompts' | 'resources'

const McpSettings: React.FC = () => {
  const { serverId } = useParams<{ serverId: string }>()
  const decodedServerId = serverId ? decodeURIComponent(serverId) : ''
  const server = useMCPServer(decodedServerId).server as MCPServer
  const { deleteMCPServer, updateMCPServer } = useMCPServers()
  const { ensureServerTrusted } = useMCPServerTrust()
  const [serverType, setServerType] = useState<MCPServer['type']>('stdio')
  const [form] = Form.useForm<MCPFormValues>()
  const [loading, setLoading] = useState(false)
  const [isFormChanged, setIsFormChanged] = useState(false)
  const [loadingServer, setLoadingServer] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('settings')

  const [tools, setTools] = useState<MCPTool[]>([])
  const [prompts, setPrompts] = useState<MCPPrompt[]>([])
  const [resources, setResources] = useState<MCPResource[]>([])
  const [isShowRegistry, setIsShowRegistry] = useState(false)
  const [registry, setRegistry] = useState<Registry[]>()
  const [customRegistryUrl, setCustomRegistryUrl] = useState('')
  const [selectedRegistryType, setSelectedRegistryType] = useState<string>('')

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [serverVersion, setServerVersion] = useState<string | null>(null)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [logs, setLogs] = useState<(MCPServerLogEntry & { serverId?: string })[]>([])

  const { theme } = useTheme()
  const { Text } = Typography

  const navigate = useNavigate()

  // Initialize form values whenever the server changes
  useEffect(() => {
    const serverType: MCPServer['type'] = server.type || (server.baseUrl ? 'sse' : 'stdio')
    setServerType(serverType)

    // Set registry UI state based on command and registryUrl
    if (server.command) {
      handleCommandChange(server.command)

      // If there's a registryUrl, ensure registry UI is shown
      if (server.registryUrl) {
        setIsShowRegistry(true)

        // Determine registry type based on command
        let currentRegistry: Registry[] = []
        if (server.command.includes('uv') || server.command.includes('uvx')) {
          currentRegistry = PipRegistry
          setRegistry(PipRegistry)
        } else if (
          server.command.includes('npx') ||
          server.command.includes('bun') ||
          server.command.includes('bunx')
        ) {
          currentRegistry = NpmRegistry
          setRegistry(NpmRegistry)
        }

        // Check if the registryUrl is a custom URL (not in the predefined list)
        const isCustomRegistry =
          currentRegistry.length > 0 &&
          !currentRegistry.some((reg) => reg.url === server.registryUrl) &&
          server.registryUrl !== '' // empty string is default

        if (isCustomRegistry) {
          // Set custom registry state
          setSelectedRegistryType('custom')
          setCustomRegistryUrl(server.registryUrl)
        } else {
          // Reset custom registry state for predefined registries
          setSelectedRegistryType('')
          setCustomRegistryUrl('')
        }
      }
    }

    // Initialize basic fields
    form.setFieldsValue({
      name: server.name,
      description: server.description,
      serverType: serverType,
      baseUrl: server.baseUrl || '',
      command: server.command || '',
      registryUrl: server.registryUrl || '',
      isActive: server.isActive,
      longRunning: server.longRunning,
      timeout: server.timeout,
      args: server.args ? server.args.join('\n') : '',
      env: server.env
        ? Object.entries(server.env)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n')
        : '',
      headers: server.headers
        ? Object.entries(server.headers)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n')
        : ''
    })

    // Initialize advanced fields separately to ensure they're captured
    // even if the Collapse panel is closed
    form.setFieldsValue({
      provider: server.provider || '',
      providerUrl: server.providerUrl || '',
      logoUrl: server.logoUrl || '',
      tags: server.tags || []
    })
  }, [server, form])

  // Watch for serverType changes
  useEffect(() => {
    const currentServerType = form.getFieldValue('serverType')
    if (currentServerType) {
      setServerType(currentServerType)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.getFieldValue('serverType')])

  const fetchTools = async () => {
    if (server.isActive) {
      try {
        setLoadingServer(server.id)
        const localTools = await window.api.mcp.listTools(server)
        setTools(localTools)
      } catch (error) {
        setLoadingServer(server.id)
      } finally {
        setLoadingServer(null)
      }
    }
  }

  const fetchPrompts = async () => {
    if (server.isActive) {
      try {
        setLoadingServer(server.id)
        const localPrompts = await window.api.mcp.listPrompts(server)
        setPrompts(localPrompts)
      } catch (error) {
        setPrompts([])
      } finally {
        setLoadingServer(null)
      }
    }
  }

  const fetchResources = async () => {
    if (server.isActive) {
      try {
        setLoadingServer(server.id)
        const localResources = await window.api.mcp.listResources(server)
        setResources(localResources)
      } catch (error) {
        setResources([])
      } finally {
        setLoadingServer(null)
      }
    }
  }

  const fetchServerVersion = async () => {
    if (server.isActive) {
      try {
        const version = await window.api.mcp.getServerVersion(server)
        setServerVersion(version)
      } catch (error) {
        setServerVersion(null)
      }
    }
  }

  const fetchServerLogs = async () => {
    try {
      const history = await window.api.mcp.getServerLogs(server)
      setLogs(history)
    } catch (error) {
      logger.warn('Failed to load server logs', error as Error)
    }
  }

  useEffect(() => {
    const unsubscribe = window.api.mcp.onServerLog((log) => {
      if (log.serverId && log.serverId !== server.id) return
      setLogs((prev) => {
        const merged = [...prev, log]
        if (merged.length > 200) {
          return merged.slice(merged.length - 200)
        }
        return merged
      })
    })

    return () => {
      unsubscribe?.()
    }
  }, [server.id])

  useEffect(() => {
    setLogs([])
  }, [server.id])

  useEffect(() => {
    if (server.isActive) {
      void fetchTools()
      void fetchPrompts()
      void fetchResources()
      void fetchServerVersion()
      void fetchServerLogs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, server.isActive])

  useEffect(() => {
    setIsFormChanged(false)
  }, [server.id])

  // Save the form data
  const onSave = async () => {
    setLoading(true)
    try {
      const values = await form.validateFields()

      // set basic fields
      const mcpServer: MCPServer = {
        ...server,
        id: server.id,
        name: values.name,
        type: values.serverType || server.type,
        description: values.description,
        isActive: values.isActive,
        registryUrl: values.registryUrl,
        searchKey: server.searchKey,
        timeout: values.timeout || server.timeout,
        longRunning: values.longRunning,
        // Use nullish coalescing to allow empty strings (for deletion)
        provider: values.provider ?? server.provider,
        providerUrl: values.providerUrl ?? server.providerUrl,
        logoUrl: values.logoUrl ?? server.logoUrl,
        tags: values.tags ?? server.tags
      }

      // set stdio or sse server
      if (values.serverType === 'sse' || values.serverType === 'streamableHttp') {
        mcpServer.baseUrl = values.baseUrl
      } else {
        mcpServer.command = values.command
        mcpServer.args = values.args ? values.args.split('\n').filter((arg) => arg.trim() !== '') : []
      }

      // set env variables
      if (values.env) {
        mcpServer.env = parseKeyValueString(values.env)
      }

      if (values.headers) {
        mcpServer.headers = parseKeyValueString(values.headers)
      }

      if (server.isActive) {
        try {
          await window.api.mcp.restartServer(mcpServer)
          updateMCPServer({ ...mcpServer, isActive: true })
          window.toast.success('服务器更新成功')
          setIsFormChanged(false)
        } catch (error: any) {
          updateMCPServer({ ...mcpServer, isActive: false })
          window.modal.error({
            title: '更新服务器失败',
            content: error.message,
            centered: true
          })
        }
      } else {
        updateMCPServer({ ...mcpServer, isActive: false })
        window.toast.success('服务器更新成功')
        setIsFormChanged(false)
      }
      setLoading(false)
    } catch (error: any) {
      setLoading(false)
      logger.error('Failed to save MCP server settings:', error)
    }
  }

  // Watch for command field changes
  const handleCommandChange = (command: string) => {
    if (command.includes('uv') || command.includes('uvx')) {
      setIsShowRegistry(true)
      setRegistry(PipRegistry)
    } else if (command.includes('npx') || command.includes('bun') || command.includes('bunx')) {
      setIsShowRegistry(true)
      setRegistry(NpmRegistry)
    } else {
      setIsShowRegistry(false)
      setRegistry(undefined)
    }
  }

  const onSelectRegistry = (url: string) => {
    const command = form.getFieldValue('command') || ''

    // If custom registry is selected
    if (url === 'custom') {
      setSelectedRegistryType('custom')
      // Don't set the registryUrl yet, wait for user input
      return
    }

    setSelectedRegistryType('')
    setCustomRegistryUrl('')

    // Add new registry env variables
    if (command.includes('uv') || command.includes('uvx')) {
      // envs['PIP_INDEX_URL'] = url
      // envs['UV_DEFAULT_INDEX'] = url
      form.setFieldsValue({ registryUrl: url })
    } else if (command.includes('npx') || command.includes('bun') || command.includes('bunx')) {
      // envs['NPM_CONFIG_REGISTRY'] = url
      form.setFieldsValue({ registryUrl: url })
    }

    // Mark form as changed
    setIsFormChanged(true)
  }

  const onCustomRegistryChange = (url: string) => {
    setCustomRegistryUrl(url)
    form.setFieldsValue({ registryUrl: url })
    setIsFormChanged(true)
  }

  const onDeleteMcpServer = useCallback(
    async (server: MCPServer) => {
      try {
        window.modal.confirm({
          title: '删除服务器',
          content: '确定要删除此服务器吗？',
          centered: true,
          onOk: async () => {
            await window.api.mcp.removeServer(server)
            deleteMCPServer(server.id)
            window.toast.success('服务器删除成功')
            navigate('/settings/mcp')
          }
        })
      } catch (error: any) {
        window.toast.error(`${'删除服务器失败'}: ${error.message}`)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [server]
  )

  const onToggleActive = async (active: boolean) => {
    if (isFormChanged && active) {
      await onSave()
      return
    }

    await form.validateFields()
    let serverForUpdate = server
    if (active) {
      const trustedServer = await ensureServerTrusted(server)
      if (!trustedServer) {
        return
      }
      serverForUpdate = trustedServer
    }

    setLoadingServer(serverForUpdate.id)
    const oldActiveState = serverForUpdate.isActive

    try {
      if (active) {
        const localTools = await window.api.mcp.listTools(serverForUpdate)
        setTools(localTools)

        const localPrompts = await window.api.mcp.listPrompts(serverForUpdate)
        setPrompts(localPrompts)

        const localResources = await window.api.mcp.listResources(serverForUpdate)
        setResources(localResources)

        const version = await window.api.mcp.getServerVersion(serverForUpdate)
        setServerVersion(version)
      } else {
        await window.api.mcp.stopServer(serverForUpdate)
        setServerVersion(null)
      }
      updateMCPServer({ ...serverForUpdate, isActive: active })
    } catch (error: any) {
      window.modal.error({
        title: '启动失败',
        content: formatMcpError(error as McpError),
        centered: true
      })
      updateMCPServer({ ...serverForUpdate, isActive: oldActiveState })
    } finally {
      setLoadingServer(null)
    }
  }

  // Handle toggling a tool on/off
  const handleToggleTool = useCallback(
    async (tool: MCPTool, enabled: boolean) => {
      // Create a new disabledTools array or use the existing one
      let disabledTools = [...(server.disabledTools || [])]

      if (enabled) {
        // Remove tool from disabledTools if it's being enabled
        disabledTools = disabledTools.filter((name) => name !== tool.name)
      } else {
        // Add tool to disabledTools if it's being disabled
        if (!disabledTools.includes(tool.name)) {
          disabledTools.push(tool.name)
        }
      }

      // Update the server with new disabledTools
      const updatedServer = {
        ...server,
        disabledTools
      }

      // Save the updated server configuration
      // await window.api.mcp.updateServer(updatedServer)
      updateMCPServer(updatedServer)
    },
    [server, updateMCPServer]
  )

  // Handle toggling auto-approve for a tool
  const handleToggleAutoApprove = useCallback(
    async (tool: MCPTool, autoApprove: boolean) => {
      let disabledAutoApproveTools = [...(server.disabledAutoApproveTools || [])]

      if (autoApprove) {
        disabledAutoApproveTools = disabledAutoApproveTools.filter((name) => name !== tool.name)
      } else {
        // Add tool to disabledTools if it's being disabled
        if (!disabledAutoApproveTools.includes(tool.name)) {
          disabledAutoApproveTools.push(tool.name)
        }
      }

      // Update the server with new disabledTools
      const updatedServer = {
        ...server,
        disabledAutoApproveTools
      }

      // Save the updated server configuration
      // await window.api.mcp.updateServer(updatedServer)
      updateMCPServer(updatedServer)
    },
    [server, updateMCPServer]
  )

  const tabs: TabsProps['items'] = [
    {
      key: 'settings',
      label: '通用',
      children: (
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setIsFormChanged(true)}
          style={{
            overflowY: 'auto',
            width: 'calc(100% + 10px)',
            paddingRight: '10px'
          }}>
          <Form.Item name="name" label={'名称'} rules={[{ required: true, message: '' }]}>
            <Input placeholder={'名称'} disabled={server.type === 'inMemory'} />
          </Form.Item>
          <Form.Item name="description" label={'描述'}>
            <TextArea rows={2} placeholder={'描述'} />
          </Form.Item>
          {server.type !== 'inMemory' && (
            <Form.Item name="serverType" label={'类型'} rules={[{ required: true }]} initialValue="stdio">
              <Select
                onChange={(value) => setServerType(value)}
                options={[
                  { label: '标准输入 / 输出 (stdio)', value: 'stdio' },
                  { label: '服务器发送事件 (sse)', value: 'sse' },
                  { label: '可流式传输的 HTTP (streamableHttp)', value: 'streamableHttp' }
                ]}
              />
            </Form.Item>
          )}
          {serverType === 'sse' && (
            <>
              <Form.Item
                name="baseUrl"
                label={'URL'}
                rules={[{ required: serverType === 'sse', message: '' }]}
                tooltip={'远程 URL 地址'}>
                <Input placeholder="http://localhost:3000/sse" />
              </Form.Item>
              <Form.Item name="headers" label={'请求头'} tooltip={'HTTP 请求的自定义请求头'}>
                <TextArea
                  rows={3}
                  placeholder={`Content-Type=application/json\nAuthorization=Bearer token`}
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
            </>
          )}
          {serverType === 'streamableHttp' && (
            <>
              <Form.Item
                name="baseUrl"
                label={'URL'}
                rules={[{ required: serverType === 'streamableHttp', message: '' }]}
                tooltip={'远程 URL 地址'}>
                <Input placeholder="http://localhost:3000/mcp" />
              </Form.Item>
              <Form.Item name="headers" label={'请求头'} tooltip={'HTTP 请求的自定义请求头'}>
                <TextArea
                  rows={3}
                  placeholder={`Content-Type=application/json\nAuthorization=Bearer token`}
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
            </>
          )}
          {serverType === 'stdio' && (
            <>
              <Form.Item name="command" label={'命令'} rules={[{ required: serverType === 'stdio', message: '' }]}>
                <Input placeholder="uvx or npx" onChange={(e) => handleCommandChange(e.target.value)} />
              </Form.Item>

              {isShowRegistry && registry && (
                <Form.Item name="registryUrl" label={'包管理源'} tooltip={'选择用于安装包的源，以解决默认源的网络问题'}>
                  <Radio.Group
                    value={selectedRegistryType === 'custom' ? 'custom' : form.getFieldValue('registryUrl') || ''}>
                    <Radio
                      key="no-proxy"
                      value=""
                      onChange={(e) => {
                        onSelectRegistry(e.target.value)
                      }}>
                      {'默认'}
                    </Radio>
                    {registry.map((reg) => (
                      <Radio
                        key={reg.url}
                        value={reg.url}
                        onChange={(e) => {
                          onSelectRegistry(e.target.value)
                        }}>
                        {reg.name}
                      </Radio>
                    ))}
                  </Radio.Group>
                  {selectedRegistryType === 'custom' && (
                    <Input
                      placeholder={'请输入私有仓库地址，如: https://npm.company.com'}
                      value={customRegistryUrl}
                      onChange={(e) => onCustomRegistryChange(e.target.value)}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </Form.Item>
              )}

              <Form.Item name="args" label={'参数'} tooltip={'每个参数占一行'}>
                <TextArea rows={3} placeholder={`arg1\narg2`} style={{ fontFamily: 'monospace' }} />
              </Form.Item>

              <Form.Item name="env" label={'环境变量'} tooltip={'格式：KEY=value，每行一个'}>
                <TextArea rows={3} placeholder={`KEY1=value1\nKEY2=value2`} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </>
          )}
          {serverType === 'inMemory' && (
            <>
              <Form.Item name="args" label={'参数'} tooltip={'每个参数占一行'}>
                <TextArea rows={3} placeholder={`arg1\narg2`} style={{ fontFamily: 'monospace' }} />
              </Form.Item>

              <Form.Item name="env" label={'环境变量'} tooltip={'格式：KEY=value，每行一个'}>
                <TextArea rows={3} placeholder={`KEY1=value1\nKEY2=value2`} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="longRunning"
            label={'长时间运行模式'}
            tooltip={'启用后，服务器支持长时间任务，接收到进度通知时会重置超时计时器，并延长最大超时时间至10分钟'}
            layout="horizontal"
            valuePropName="checked">
            <Switch size="small" style={{ marginLeft: 10 }} />
          </Form.Item>
          <Form.Item name="timeout" label={'超时'} tooltip={'对该服务器请求的超时时间（秒），默认为 60 秒'}>
            <Input type="number" min={1} placeholder="60" addonAfter="s" />
          </Form.Item>

          <AdvancedSettingsButton onClick={() => setShowAdvanced(!showAdvanced)}>
            <ChevronDown
              size={18}
              style={{
                transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s',
                marginRight: 8,
                stroke: 'var(--color-primary)'
              }}
            />
            {'高级设置'}
          </AdvancedSettingsButton>

          {showAdvanced && (
            <>
              <Form.Item name="provider" label={'提供者'}>
                <Input placeholder={'提供者名称'} />
              </Form.Item>

              <Form.Item name="providerUrl" label={'提供者网址'}>
                <Input placeholder="https://provider-website.com" />
              </Form.Item>

              <Form.Item name="logoUrl" label={'标志网址'}>
                <Input placeholder="https://example.com/logo.png" />
              </Form.Item>

              <Form.Item name="tags" label={'标签'}>
                <Select mode="tags" style={{ width: '100%' }} placeholder={'输入标签'} tokenSeparators={[',']} />
              </Form.Item>
            </>
          )}
        </Form>
      )
    }
  ]

  if (server.searchKey) {
    tabs.push({
      key: 'description',
      label: '描述',
      children: <MCPDescription searchKey={server.searchKey} />
    })
  }

  if (server.isActive) {
    tabs.push(
      {
        key: 'tools',
        label: '工具' + (tools.length > 0 ? ` (${tools.length})` : ''),
        children: (
          <MCPToolsSection
            tools={tools}
            server={server}
            onToggleTool={handleToggleTool}
            onToggleAutoApprove={handleToggleAutoApprove}
          />
        )
      },
      {
        key: 'prompts',
        label: '提示' + (prompts.length > 0 ? ` (${prompts.length})` : ''),
        children: <MCPPromptsSection prompts={prompts} />
      },
      {
        key: 'resources',
        label: '资源' + (resources.length > 0 ? ` (${resources.length})` : ''),
        children: <MCPResourcesSection resources={resources} />
      }
    )
  }

  return (
    <Container>
      <SettingContainer theme={theme} style={{ width: '100%', paddingTop: 55, backgroundColor: 'transparent' }}>
        <SettingGroup style={{ marginBottom: 0, borderRadius: 'var(--list-item-border-radius)' }}>
          <SettingTitle>
            <Flex justify="space-between" align="center" gap={5} style={{ marginRight: 10 }}>
              <Flex align="center" gap={8}>
                <ServerName className="text-nowrap">{server?.name}</ServerName>
                {serverVersion && <VersionBadge count={serverVersion} color="blue" />}
              </Flex>
              <Button size="small" onClick={() => setLogModalOpen(true)}>
                {'日志'}
              </Button>
              <Button
                danger
                icon={<DeleteIcon size={14} className="lucide-custom" />}
                type="text"
                onClick={() => onDeleteMcpServer(server)}
              />
            </Flex>
            <Flex align="center" gap={16}>
              <Switch
                value={server.isActive}
                key={server.id}
                loading={loadingServer === server.id}
                onChange={onToggleActive}
              />
              <Button
                type="primary"
                icon={<SaveIcon size={14} />}
                onClick={onSave}
                loading={loading}
                shape="round"
                disabled={!isFormChanged || activeTab !== 'settings'}>
                {'保存'}
              </Button>
            </Flex>
          </SettingTitle>
          <SettingDivider />
          <Tabs
            defaultActiveKey="settings"
            items={tabs}
            onChange={(key) => setActiveTab(key as TabKey)}
            style={{ marginTop: 8, backgroundColor: 'transparent' }}
          />
        </SettingGroup>
      </SettingContainer>

      <Modal
        title={'日志'}
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        footer={null}
        width={720}
        centered
        transitionName="animation-move-down"
        bodyStyle={{ maxHeight: '70vh', minHeight: '40vh', overflowY: 'auto' }}
        afterOpenChange={(open) => {
          if (open) {
            void fetchServerLogs()
          }
        }}>
        <LogList>
          {logs.length === 0 && <Text type="secondary">{'暂无日志'}</Text>}
          {logs.map((log, idx) => (
            <LogItem key={`${log.timestamp}-${idx}`}>
              <LogHeader>
                <Timestamp>{new Date(log.timestamp).toLocaleTimeString()}</Timestamp>
                <Tag color={mapLogLevelColor(log.level)}>{log.level}</Tag>
                <LogMessage>{log.message}</LogMessage>
              </LogHeader>
              {log.data && (
                <PreBlock>{typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}</PreBlock>
              )}
            </LogItem>
          ))}
        </LogList>
      </Modal>
    </Container>
  )
}

const Container = styled(Scrollbar)`
  height: calc(100vh - var(--navbar-height));
`

const ServerName = styled.span`
  font-size: 14px;
  font-weight: 500;
`

const AdvancedSettingsButton = styled.div`
  cursor: pointer;
  margin-bottom: 16px;
  margin-top: -10px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
`

const LogList = styled(Scrollbar)`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 15px;
  padding-top: 5px;
`

const LogItem = styled.div`
  background: var(--color-background-mute, #1f1f1f);
  color: var(--color-text-1, #e6e6e6);
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
`

const LogHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
`

const Timestamp = styled.span`
  color: var(--color-text-3, #9aa2b1);
  font-size: 12px;
  flex-shrink: 0;
`

const LogMessage = styled.span`
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
`

const PreBlock = styled.pre`
  margin: 6px 0 0;
  padding: 8px;
  background: var(--color-bg-3, #111418);
  color: var(--color-text-1, #e6e6e6);
  border-radius: 6px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
`

function mapLogLevelColor(level: MCPServerLogEntry['level']) {
  switch (level) {
    case 'error':
    case 'stderr':
      return 'red'
    case 'warn':
      return 'orange'
    case 'info':
    case 'stdout':
      return 'blue'
    default:
      return 'default'
  }
}

const VersionBadge = styled(Badge)`
  .ant-badge-count {
    background-color: var(--color-primary);
    color: white;
    font-size: 11px;
    font-weight: 500;
    padding: 0 6px;
    height: 18px;
    line-height: 18px;
    border-radius: 9px;
    min-width: 18px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
`

export default McpSettings
