import { loggerService } from '@logger'
import { nanoid } from '@reduxjs/toolkit'
import CollapsibleSearchBar from '@renderer/components/CollapsibleSearchBar'
import { DraggableList, useDraggableReorder } from '@renderer/components/DraggableList'
import { EditIcon } from '@renderer/components/Icons'
import Scrollbar from '@renderer/components/Scrollbar'
import { useMCPServers } from '@renderer/hooks/useMCPServers'
import { useMCPServerTrust } from '@renderer/hooks/useMCPServerTrust'
import type { MCPServer } from '@renderer/types'
import { formatMcpError } from '@renderer/utils/error'
import { matchKeywordsInString } from '@renderer/utils/match'
import { Button, Dropdown, Empty } from 'antd'
import { Plus } from 'lucide-react'
import type { FC } from 'react'
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import styled from 'styled-components'

import { SettingTitle } from '..'
import AddMcpServerModal from './AddMcpServerModal'
import EditMcpJsonPopup from './EditMcpJsonPopup'
import InstallNpxUv from './InstallNpxUv'
import McpServerCard from './McpServerCard'

const logger = loggerService.withContext('McpServersList')

const McpServersList: FC = () => {
  const { mcpServers, addMCPServer, deleteMCPServer, updateMcpServers, updateMCPServer } = useMCPServers()
  const { ensureServerTrusted } = useMCPServerTrust()
  const navigate = useNavigate()
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const [modalType, setModalType] = useState<'json' | 'dxt'>('json')
  const [loadingServerIds, setLoadingServerIds] = useState<Set<string>>(new Set())
  const [serverVersions, setServerVersions] = useState<Record<string, string | null>>({})

  const [searchText, _setSearchText] = useState('')

  const setSearchText = useCallback((text: string) => {
    startTransition(() => {
      _setSearchText(text)
    })
  }, [])

  const filteredMcpServers = useMemo(() => {
    if (!searchText.trim()) return mcpServers

    const keywords = searchText.toLowerCase().split(/\s+/).filter(Boolean)

    return mcpServers.filter((server) => {
      const searchTarget = `${server.name} ${server.description} ${server.tags?.join(' ')}`
      return matchKeywordsInString(keywords, searchTarget)
    })
  }, [mcpServers, searchText])

  const { onDragEnd } = useDraggableReorder({
    originalList: mcpServers,
    filteredList: filteredMcpServers,
    onUpdate: updateMcpServers,
    itemKey: 'id'
  })

  const scrollRef = useRef<HTMLDivElement>(null)

  // 简单的滚动位置记忆
  useEffect(() => {
    // 恢复滚动位置
    const savedScroll = sessionStorage.getItem('mcp-list-scroll')
    if (savedScroll && scrollRef.current) {
      scrollRef.current.scrollTop = Number(savedScroll)
    }

    // 保存滚动位置
    const handleScroll = () => {
      if (scrollRef.current) {
        sessionStorage.setItem('mcp-list-scroll', String(scrollRef.current.scrollTop))
      }
    }

    const container = scrollRef.current
    container?.addEventListener('scroll', handleScroll)
    return () => container?.removeEventListener('scroll', handleScroll)
  }, [])

  const fetchServerVersion = useCallback(async (server: MCPServer) => {
    if (!server.isActive) return

    try {
      const version = await window.api.mcp.getServerVersion(server)
      setServerVersions((prev) => ({ ...prev, [server.id]: version }))
    } catch (error) {
      setServerVersions((prev) => ({ ...prev, [server.id]: null }))
    }
  }, [])

  // Fetch versions for all active servers
  useEffect(() => {
    mcpServers.forEach((server) => {
      if (server.isActive) {
        void fetchServerVersion(server)
      }
    })
  }, [mcpServers, fetchServerVersion])

  const onAddMcpServer = useCallback(async () => {
    const newServer = {
      id: nanoid(),
      name: 'MCP 服务器',
      description: '',
      baseUrl: '',
      command: '',
      args: [],
      env: {},
      isActive: false
    }
    addMCPServer(newServer)
    navigate(`/settings/mcp/settings/${encodeURIComponent(newServer.id)}`)
    window.toast.success('服务器添加成功')
  }, [addMCPServer, navigate])

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
          }
        })
      } catch (error: any) {
        window.toast.error(`${'删除服务器失败'}: ${error.message}`)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleAddServerSuccess = useCallback(
    async (server: MCPServer) => {
      addMCPServer(server)
      setIsAddModalVisible(false)
      window.toast.success('服务器添加成功')
      // Optionally navigate to the new server's settings page
      // navigate(`/settings/mcp/settings/${encodeURIComponent(server.id)}`)
    },
    [addMCPServer]
  )

  const handleToggleActive = async (server: MCPServer, active: boolean) => {
    let serverForUpdate = server
    if (active) {
      const trustedServer = await ensureServerTrusted(server)
      if (!trustedServer) {
        return
      }
      serverForUpdate = trustedServer
    }

    setLoadingServerIds((prev) => new Set(prev).add(serverForUpdate.id))
    const oldActiveState = serverForUpdate.isActive
    logger.silly('toggle activate', { serverId: serverForUpdate.id, active })
    try {
      if (active) {
        await fetchServerVersion({ ...serverForUpdate, isActive: active })
      } else {
        await window.api.mcp.stopServer(serverForUpdate)
        setServerVersions((prev) => ({ ...prev, [serverForUpdate.id]: null }))
      }
      updateMCPServer({ ...serverForUpdate, isActive: active })
    } catch (error: any) {
      window.modal.error({
        title: '启动失败',
        content: formatMcpError(error),
        centered: true
      })
      updateMCPServer({ ...serverForUpdate, isActive: oldActiveState })
    } finally {
      setLoadingServerIds((prev) => {
        const next = new Set(prev)
        next.delete(serverForUpdate.id)
        return next
      })
    }
  }

  const menuItems = useMemo(
    () => [
      {
        key: 'manual',
        label: '快速创建',
        onClick: () => {
          void onAddMcpServer()
        }
      },
      {
        key: 'json',
        label: '从 JSON 导入',
        onClick: () => {
          setModalType('json')
          setIsAddModalVisible(true)
        }
      },
      {
        key: 'dxt',
        label: '导入 DXT 包',
        onClick: () => {
          setModalType('dxt')
          setIsAddModalVisible(true)
        }
      }
    ],
    [onAddMcpServer]
  )

  return (
    <Container ref={scrollRef}>
      <ListHeader>
        <SettingTitle style={{ gap: 6 }}>
          <span>{'MCP 服务器'}</span>
          <CollapsibleSearchBar
            onSearch={setSearchText}
            placeholder={'搜索 MCP 服务器...'}
            tooltip={'搜索 MCP 服务器'}
            style={{ borderRadius: 20 }}
          />
        </SettingTitle>
        <ButtonGroup>
          <InstallNpxUv mini />
          <Button icon={<EditIcon size={14} />} type="default" shape="round" onClick={() => EditMcpJsonPopup.show()}>
            {'编辑'}
          </Button>
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button icon={<Plus size={16} />} type="default" shape="round">
              {'添加'}
            </Button>
          </Dropdown>
        </ButtonGroup>
      </ListHeader>
      <DraggableList
        list={filteredMcpServers}
        itemKey="id"
        onDragEnd={onDragEnd}
        onUpdate={updateMcpServers}
        style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '12px' }}
        listStyle={{ width: '100%' }}>
        {(server) => (
          <McpServerCard
            server={server}
            version={serverVersions[server.id]}
            isLoading={loadingServerIds.has(server.id)}
            onToggle={async (active) => await handleToggleActive(server, active)}
            onDelete={() => onDeleteMcpServer(server)}
            onEdit={() => navigate(`/settings/mcp/settings/${encodeURIComponent(server.id)}`)}
            onOpenUrl={(url) => window.open(url, '_blank')}
          />
        )}
      </DraggableList>
      {(mcpServers.length === 0 || filteredMcpServers.length === 0) && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={mcpServers.length === 0 ? '未配置服务器' : '无结果'}
          style={{ marginTop: 20 }}
        />
      )}

      <AddMcpServerModal
        visible={isAddModalVisible}
        onClose={() => setIsAddModalVisible(false)}
        onSuccess={handleAddServerSuccess}
        existingServers={mcpServers} // 傳遞現有的伺服器列表
        initialImportMethod={modalType}
      />
    </Container>
  )
}

const Container = styled(Scrollbar)`
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  height: calc(100vh - var(--navbar-height));
  overflow: hidden;
  padding: 20px;
  padding-top: 15px;
  gap: 15px;
  overflow-y: auto;
`

const ListHeader = styled.div`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    font-size: 22px;
    margin: 0;
  }
`

const ButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

export default McpServersList
