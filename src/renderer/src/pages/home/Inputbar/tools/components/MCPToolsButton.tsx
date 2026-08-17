import type { QuickPanelListItem } from '@renderer/components/QuickPanel'
import { QuickPanelReservedSymbol, useQuickPanel } from '@renderer/components/QuickPanel'
import { isGemini3Model, isGeminiModel } from '@renderer/config/models'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useMCPServers } from '@renderer/hooks/useMCPServers'
import { useTimer } from '@renderer/hooks/useTimer'
import type { ToolQuickPanelApi } from '@renderer/pages/home/Inputbar/types'
import { getProviderByModel } from '@renderer/services/AssistantService'
import { EventEmitter } from '@renderer/services/EventService'
import type { McpMode, MCPPrompt, MCPResource, MCPServer } from '@renderer/types'
import { getEffectiveMcpMode } from '@renderer/types'
import { isToolUseModeFunction } from '@renderer/utils/assistant'
import { isGeminiWebSearchProvider, isSupportUrlContextProvider } from '@renderer/utils/provider'
import { Form, Input } from 'antd'
import { CircleX, Hammer, Plus, Sparkles } from 'lucide-react'
import type { FC } from 'react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import ToolActionIconButton from './ToolActionIconButton'

interface Props {
  assistantId: string
  quickPanel: ToolQuickPanelApi
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  resizeTextArea: () => void
}

interface PromptArgument {
  name: string
  description?: string
  required?: boolean
}

interface MCPPromptWithArgs extends MCPPrompt {
  arguments?: PromptArgument[]
}

interface ResourceData {
  blob?: string
  mimeType?: string
  name?: string
  text?: string
  uri?: string
}

const extractPromptContent = (response: any): string | null => {
  if (typeof response === 'string') {
    return response
  }

  if (response && Array.isArray(response.messages)) {
    let formattedContent = ''

    for (const message of response.messages) {
      if (!message.content) continue

      const rolePrefix = message.role ? `**${message.role.charAt(0).toUpperCase() + message.role.slice(1)}:** ` : ''

      switch (message.content.type) {
        case 'text':
          formattedContent += `${rolePrefix}${message.content.text}\n\n`
          break

        case 'image':
          if (message.content.data && message.content.mimeType) {
            if (rolePrefix) {
              formattedContent += `${rolePrefix}\n`
            }
            formattedContent += `![Image](data:${message.content.mimeType};base64,${message.content.data})\n\n`
          }
          break

        case 'audio':
          formattedContent += `${rolePrefix}[Audio content available]\n\n`
          break

        case 'resource':
          if (message.content.text) {
            formattedContent += `${rolePrefix}${message.content.text}\n\n`
          } else {
            formattedContent += `${rolePrefix}[Resource content available]\n\n`
          }
          break

        default:
          if (message.content.text) {
            formattedContent += `${rolePrefix}${message.content.text}\n\n`
          }
      }
    }

    return formattedContent.trim()
  }

  if (response && response.messages && response.messages.length > 0) {
    const message = response.messages[0]
    if (message.content && message.content.text) {
      const rolePrefix = message.role ? `**${message.role.charAt(0).toUpperCase() + message.role.slice(1)}:** ` : ''
      return `${rolePrefix}${message.content.text}`
    }
  }

  return null
}

const MCPToolsButton: FC<Props> = ({ quickPanel, setInputValue, resizeTextArea, assistantId }) => {
  const { activedMcpServers } = useMCPServers()
  const quickPanelHook = useQuickPanel()
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const { assistant, updateAssistant } = useAssistant(assistantId)
  const model = assistant.model
  const { setTimeoutTimer } = useTimer()

  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const currentMode = useMemo(() => getEffectiveMcpMode(assistant), [assistant])

  const mcpServers = useMemo(() => assistant.mcpServers || [], [assistant.mcpServers])
  const assistantMcpServers = useMemo(
    () => activedMcpServers.filter((server) => mcpServers.some((s) => s.id === server.id)),
    [activedMcpServers, mcpServers]
  )

  const handleModeChange = useCallback(
    (mode: McpMode) => {
      setTimeoutTimer(
        'updateMcpMode',
        () => {
          updateAssistant({
            ...assistant,
            mcpMode: mode
          })
        },
        200
      )
    },
    [assistant, setTimeoutTimer, updateAssistant]
  )

  const handleMcpServerSelect = useCallback(
    (server: MCPServer) => {
      const update = { ...assistant }
      if (assistantMcpServers.some((s) => s.id === server.id)) {
        update.mcpServers = mcpServers.filter((s) => s.id !== server.id)
      } else {
        update.mcpServers = [...mcpServers, server]
      }

      if (update.mcpServers.length > 0 && isGeminiModel(model) && isToolUseModeFunction(assistant)) {
        const provider = getProviderByModel(model)
        if (isSupportUrlContextProvider(provider) && assistant.enableUrlContext) {
          window.toast.warning('Gemini 不支持同时使用网页上下文与函数调用')
          update.enableUrlContext = false
        }
        // Gemini 3+ supports combining built-in tools with function calling
        if (isGeminiWebSearchProvider(provider) && assistant.enableWebSearch && !isGemini3Model(model)) {
          window.toast.warning('Gemini 不支持同时使用原生网络搜索工具与函数调用')
          update.enableWebSearch = false
        }
      }

      update.mcpMode = 'manual'
      updateAssistant(update)
    },
    [assistant, assistantMcpServers, mcpServers, model, updateAssistant]
  )

  const handleMcpServerSelectRef = useRef(handleMcpServerSelect)
  handleMcpServerSelectRef.current = handleMcpServerSelect

  useEffect(() => {
    const handler = (server: MCPServer) => handleMcpServerSelectRef.current(server)
    EventEmitter.on('mcp-server-select', handler)
    return () => EventEmitter.off('mcp-server-select', handler)
  }, [])

  const manualModeMenuItems = useMemo(() => {
    const newList: QuickPanelListItem[] = activedMcpServers.map((server) => ({
      label: server.name,
      description: server.description || server.baseUrl,
      icon: <Hammer />,
      action: () => EventEmitter.emit('mcp-server-select', server),
      isSelected: assistantMcpServers.some((s) => s.id === server.id)
    }))

    newList.push({
      label: '添加服务器' + '...',
      icon: <Plus />,
      action: () => navigate('/settings/mcp')
    })

    return newList
  }, [activedMcpServers, assistantMcpServers, navigate])

  const openManualModePanel = useCallback(() => {
    quickPanelHook.open({
      title: '手动',
      list: manualModeMenuItems,
      symbol: QuickPanelReservedSymbol.Mcp,
      multiple: true,
      afterAction({ item }) {
        item.isSelected = !item.isSelected
      }
    })
  }, [manualModeMenuItems, quickPanelHook])

  const menuItems = useMemo(() => {
    const newList: QuickPanelListItem[] = []

    newList.push({
      label: '禁用',
      description: '不使用 MCP 工具',
      icon: <CircleX />,
      isSelected: currentMode === 'disabled',
      action: () => {
        handleModeChange('disabled')
        quickPanelHook.close()
      }
    })

    newList.push({
      label: '自动',
      description: 'AI 自动发现和使用工具',
      icon: <Sparkles />,
      isSelected: currentMode === 'auto',
      action: () => {
        handleModeChange('auto')
        quickPanelHook.close()
      }
    })

    newList.push({
      label: '手动',
      description: '选择特定的 MCP 服务器',
      icon: <Hammer />,
      isSelected: currentMode === 'manual',
      isMenu: true,
      action: () => {
        handleModeChange('manual')
        openManualModePanel()
      }
    })

    return newList
  }, [currentMode, handleModeChange, quickPanelHook, openManualModePanel])

  const openQuickPanel = useCallback(() => {
    quickPanelHook.open({
      title: 'MCP 服务器',
      list: menuItems,
      symbol: QuickPanelReservedSymbol.Mcp,
      multiple: false
    })
  }, [menuItems, quickPanelHook])

  const insertPromptIntoTextArea = useCallback(
    (promptText: string) => {
      setInputValue((prev) => {
        const textArea = document.querySelector('.inputbar textarea') as HTMLTextAreaElement
        if (!textArea) return prev + promptText

        const cursorPosition = textArea.selectionStart
        const selectionStart = cursorPosition
        const selectionEndPosition = cursorPosition + promptText.length
        const newText = prev.slice(0, cursorPosition) + promptText + prev.slice(cursorPosition)

        requestAnimationFrame(() => {
          textArea.focus()
          textArea.setSelectionRange(selectionStart, selectionEndPosition)
          resizeTextArea()
        })
        return newText
      })
    },
    [setInputValue, resizeTextArea]
  )

  const handlePromptSelect = useCallback(
    (prompt: MCPPromptWithArgs) => {
      const server = activedMcpServers.find((s) => s.id === prompt.serverId)
      if (!server) return

      const handlePromptResponse = async (response: any) => {
        const promptContent = extractPromptContent(response)
        if (promptContent) {
          insertPromptIntoTextArea(promptContent)
        } else {
          throw new Error('Invalid prompt response format')
        }
      }

      const handlePromptWithArgs = async () => {
        try {
          form.resetFields()

          const result = await new Promise<Record<string, string>>((resolve, reject) => {
            window.modal.confirm({
              title: `${'参数'}: ${prompt.name}`,
              content: (
                <Form form={form} layout="vertical">
                  {prompt.arguments?.map((arg, index) => (
                    <Form.Item
                      key={index}
                      name={arg.name}
                      label={`${arg.name}${arg.required ? ' *' : ''}`}
                      tooltip={arg.description}
                      rules={arg.required ? [{ required: true, message: '必填字段' }] : []}>
                      <Input placeholder={arg.description || arg.name} />
                    </Form.Item>
                  ))}
                </Form>
              ),
              onOk: async () => {
                try {
                  const values = await form.validateFields()
                  resolve(values)
                } catch (error) {
                  reject(error)
                }
              },
              onCancel: () => reject(new Error('cancelled')),
              okText: '确认',
              cancelText: '取消'
            })
          })

          const response = await window.api.mcp.getPrompt({
            server,
            name: prompt.name,
            args: result
          })

          await handlePromptResponse(response)
        } catch (error: any) {
          if (error.message !== 'cancelled') {
            window.modal.error({
              title: '错误',
              content: error.message || '获取提示错误'
            })
          }
        }
      }

      const handlePromptWithoutArgs = async () => {
        try {
          const response = await window.api.mcp.getPrompt({
            server,
            name: prompt.name
          })
          await handlePromptResponse(response)
        } catch (error: any) {
          window.modal.error({
            title: '错误',
            content: error.message || '获取提示错误'
          })
        }
      }

      requestAnimationFrame(() => {
        const hasArguments = prompt.arguments && prompt.arguments.length > 0
        if (hasArguments) {
          void handlePromptWithArgs()
        } else {
          void handlePromptWithoutArgs()
        }
      })
    },
    [activedMcpServers, form, insertPromptIntoTextArea]
  )

  const promptList = useMemo(async () => {
    const prompts: MCPPrompt[] = []

    for (const server of activedMcpServers) {
      const serverPrompts = await window.api.mcp.listPrompts(server)
      prompts.push(...serverPrompts)
    }

    return prompts.map((prompt) => ({
      label: prompt.name,
      description: prompt.description,
      icon: <Hammer />,
      action: () => handlePromptSelect(prompt as MCPPromptWithArgs)
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activedMcpServers])

  const openPromptList = useCallback(async () => {
    const prompts = await promptList
    quickPanelHook.open({
      title: 'MCP 服务器',
      list: prompts,
      symbol: QuickPanelReservedSymbol.McpPrompt,
      multiple: true
    })
  }, [promptList, quickPanelHook])

  const handleResourceSelect = useCallback(
    (resource: MCPResource) => {
      const server = activedMcpServers.find((s) => s.id === resource.serverId)
      if (!server) return

      const processResourceContent = (resourceData: ResourceData) => {
        if (resourceData.blob) {
          if (resourceData.mimeType?.startsWith('image/')) {
            const imageMarkdown = `![${resourceData.name || 'Image'}](data:${resourceData.mimeType};base64,${resourceData.blob})`
            insertPromptIntoTextArea(imageMarkdown)
          } else {
            const resourceInfo = `[${resourceData.name || resource.name} - ${resourceData.mimeType || '隐藏二进制数据'}]`
            insertPromptIntoTextArea(resourceInfo)
          }
        } else if (resourceData.text) {
          insertPromptIntoTextArea(resourceData.text)
        } else {
          const resourceInfo = `[${resourceData.name || resource.name} - ${resourceData.uri || resource.uri}]`
          insertPromptIntoTextArea(resourceInfo)
        }
      }

      requestAnimationFrame(async () => {
        try {
          const response = await window.api.mcp.getResource({
            server,
            uri: resource.uri
          })

          if (response?.contents && Array.isArray(response.contents)) {
            response.contents.forEach((content: ResourceData) => processResourceContent(content))
          } else {
            processResourceContent(response as ResourceData)
          }
        } catch (error: any) {
          window.modal.error({
            title: '错误',
            content: error.message || '获取资源错误'
          })
        }
      })
    },
    [activedMcpServers, insertPromptIntoTextArea]
  )

  const [resourcesList, setResourcesList] = useState<QuickPanelListItem[]>([])

  useEffect(() => {
    let isMounted = true

    const fetchResources = async () => {
      const resources: MCPResource[] = []

      for (const server of activedMcpServers) {
        const serverResources = await window.api.mcp.listResources(server)
        resources.push(...serverResources)
      }

      if (isMounted) {
        setResourcesList(
          resources.map((resource) => ({
            label: resource.name,
            description: resource.description,
            icon: <Hammer />,
            action: () => handleResourceSelect(resource)
          }))
        )
      }
    }

    void fetchResources()

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activedMcpServers])

  const openResourcesList = useCallback(async () => {
    quickPanelHook.open({
      title: 'MCP 服务器',
      list: resourcesList,
      symbol: QuickPanelReservedSymbol.McpResource,
      multiple: true
    })
  }, [resourcesList, quickPanelHook])

  const handleOpenQuickPanel = useCallback(() => {
    if (quickPanelHook.isVisible && quickPanelHook.symbol === QuickPanelReservedSymbol.Mcp) {
      quickPanelHook.close()
    } else {
      openQuickPanel()
    }
  }, [openQuickPanel, quickPanelHook])

  useEffect(() => {
    const disposeMain = quickPanel.registerRootMenu([
      {
        label: 'MCP 服务器',
        description: '',
        icon: <Hammer />,
        isMenu: true,
        action: () => openQuickPanel()
      },
      {
        label: `MCP ${'提示'}`,
        description: '',
        icon: <Hammer />,
        isMenu: true,
        action: () => openPromptList()
      },
      {
        label: `MCP ${'资源'}`,
        description: '',
        icon: <Hammer />,
        isMenu: true,
        action: () => openResourcesList()
      }
    ])

    const disposeMainTrigger = quickPanel.registerTrigger(QuickPanelReservedSymbol.Mcp, () => openQuickPanel())
    const disposePromptTrigger = quickPanel.registerTrigger(QuickPanelReservedSymbol.McpPrompt, () => openPromptList())
    const disposeResourceTrigger = quickPanel.registerTrigger(QuickPanelReservedSymbol.McpResource, () =>
      openResourcesList()
    )

    return () => {
      disposeMain()
      disposeMainTrigger()
      disposePromptTrigger()
      disposeResourceTrigger()
    }
  }, [openPromptList, openQuickPanel, openResourcesList, quickPanel])

  const isActive = currentMode !== 'disabled'

  const getButtonIcon = () => {
    switch (currentMode) {
      case 'auto':
        return <Sparkles size={18} />
      case 'disabled':
      case 'manual':
      default:
        return <Hammer size={18} />
    }
  }

  return (
    <ToolActionIconButton tooltip="MCP 服务器" onClick={handleOpenQuickPanel} active={isActive}>
      {getButtonIcon()}
    </ToolActionIconButton>
  )
}

export default React.memo(MCPToolsButton)
