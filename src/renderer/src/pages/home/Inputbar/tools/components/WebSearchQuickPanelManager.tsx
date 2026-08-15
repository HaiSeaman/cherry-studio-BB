import { BaiduOutlined, GoogleOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import {
  BingLogo,
  BochaLogo,
  ExaLogo,
  QueritLogo,
  SearXNGLogo,
  TavilyLogo,
  ZhipuLogo
} from '@renderer/components/Icons'
import type { QuickPanelListItem } from '@renderer/components/QuickPanel'
import { QuickPanelReservedSymbol } from '@renderer/components/QuickPanel'
import {
  isGemini3Model,
  isGeminiModel,
  isGPT5SeriesReasoningModel,
  isOpenAIWebSearchModel,
  isWebSearchModel
} from '@renderer/config/models'
import { useAssistant } from '@renderer/hooks/useAssistant'
import { useTimer } from '@renderer/hooks/useTimer'
import { useWebSearchProviders } from '@renderer/hooks/useWebSearchProviders'
import type { ToolQuickPanelController, ToolRenderContext } from '@renderer/pages/home/Inputbar/types'
import { getProviderByModel } from '@renderer/services/AssistantService'
import WebSearchService from '@renderer/services/WebSearchService'
import { getEffectiveMcpMode, type WebSearchProvider, type WebSearchProviderId } from '@renderer/types'
import { hasObjectKey } from '@renderer/utils'
import { isToolUseModeFunction } from '@renderer/utils/assistant'
import { isGeminiWebSearchProvider } from '@renderer/utils/provider'
import { Globe } from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
const logger = loggerService.withContext('WebSearchQuickPanel')

export const WebSearchProviderIcon = ({
  pid,
  size = 18,
  color
}: {
  pid?: WebSearchProviderId
  size?: number
  color?: string
}) => {
  switch (pid) {
    case 'bocha':
      return <BochaLogo className="icon" width={size} height={size} color={color} />
    case 'exa':
      return <ExaLogo className="icon" width={size - 2} height={size} color={color} />
    case 'tavily':
      return <TavilyLogo className="icon" width={size} height={size} color={color} />
    case 'zhipu':
      return <ZhipuLogo className="icon" width={size} height={size} color={color} />
    case 'searxng':
      return <SearXNGLogo className="icon" width={size} height={size} color={color} />
    case 'querit':
      return <QueritLogo className="icon" width={size} height={size} color={color} />
    case 'local-baidu':
      return <BaiduOutlined size={size} style={{ color, fontSize: size }} />
    case 'local-bing':
      return <BingLogo className="icon" width={size} height={size} color={color} />
    case 'local-google':
      return <GoogleOutlined size={size} style={{ color, fontSize: size }} />
    default:
      return <Globe className="icon" size={size} style={{ color, fontSize: size }} />
  }
}

export const useWebSearchPanelController = (assistantId: string, quickPanelController: ToolQuickPanelController) => {
  const { assistant, updateAssistant } = useAssistant(assistantId)
  const { providers } = useWebSearchProviders()
  const { setTimeoutTimer } = useTimer()

  const enableWebSearch = assistant?.webSearchProviderId || assistant.enableWebSearch

  const updateWebSearchProvider = useCallback(
    async (providerId?: WebSearchProvider['id']) => {
      setTimeoutTimer('updateWebSearchProvider', () => {
        updateAssistant({
          ...assistant,
          webSearchProviderId: providerId,
          enableWebSearch: false
        })
      })
    },
    [assistant, setTimeoutTimer, updateAssistant]
  )

  const updateQuickPanelItem = useCallback(
    async (providerId?: WebSearchProvider['id']) => {
      if (providerId === assistant.webSearchProviderId) {
        void updateWebSearchProvider(undefined)
      } else {
        void updateWebSearchProvider(providerId)
      }
    },
    [assistant.webSearchProviderId, updateWebSearchProvider]
  )

  const updateToModelBuiltinWebSearch = useCallback(async () => {
    const update = {
      ...assistant,
      webSearchProviderId: undefined,
      enableWebSearch: !assistant.enableWebSearch
    }
    const model = assistant.model
    const provider = getProviderByModel(model)
    if (!model) {
      logger.error('Model does not exist.')
      window.toast.error('模型不存在')
      return
    }
    // Gemini 3+ supports combining built-in tools with function calling
    if (
      isGeminiWebSearchProvider(provider) &&
      isGeminiModel(model) &&
      !isGemini3Model(model) &&
      isToolUseModeFunction(assistant) &&
      update.enableWebSearch &&
      getEffectiveMcpMode(assistant) !== 'disabled'
    ) {
      update.enableWebSearch = false
      window.toast.warning('Gemini 不支持同时使用原生网络搜索工具与函数调用')
    }
    if (
      isOpenAIWebSearchModel(model) &&
      isGPT5SeriesReasoningModel(model) &&
      update.enableWebSearch &&
      assistant.settings?.reasoning_effort === 'minimal'
    ) {
      update.enableWebSearch = false
      window.toast.warning('GPT5 模型 minimal 思考强度不支持网络搜索')
    }
    setTimeoutTimer('updateSelectedWebSearchBuiltin', () => updateAssistant(update), 200)
  }, [assistant, setTimeoutTimer, updateAssistant])

  const providerItems = useMemo<QuickPanelListItem[]>(() => {
    const isWebSearchModelEnabled = assistant.model && isWebSearchModel(assistant.model)
    const items: QuickPanelListItem[] = []
    items.push(
      ...providers
        .map((p) => ({
          label: p.name,
          description: WebSearchService.isWebSearchEnabled(p.id)
            ? hasObjectKey(p, 'apiKey')
              ? 'API 密钥'
              : '免费'
            : '需要先在设置中检查网络搜索连通性',
          icon: <WebSearchProviderIcon size={13} pid={p.id} />,
          isSelected: p.id === assistant?.webSearchProviderId,
          disabled: !WebSearchService.isWebSearchEnabled(p.id),
          action: () => updateQuickPanelItem(p.id)
        }))
        .filter((item) => !item.disabled)
    )

    if (isWebSearchModelEnabled) {
      items.unshift({
        label: '模型内置',
        description: isWebSearchModelEnabled ? '使用模型内置的网络搜索功能' : '当前模型不支持网络搜索功能',
        icon: <Globe />,
        isSelected: assistant.enableWebSearch,
        disabled: !isWebSearchModelEnabled,
        action: () => updateToModelBuiltinWebSearch()
      })
    }

    return items
  }, [assistant, providers, updateQuickPanelItem, updateToModelBuiltinWebSearch])

  const openQuickPanel = useCallback(() => {
    quickPanelController.open({
      title: '网络搜索',
      list: providerItems,
      symbol: QuickPanelReservedSymbol.WebSearch,
      pageSize: 9
    })
  }, [providerItems, quickPanelController])

  const toggleQuickPanel = useCallback(() => {
    if (quickPanelController.isVisible && quickPanelController.symbol === QuickPanelReservedSymbol.WebSearch) {
      quickPanelController.close()
    } else {
      openQuickPanel()
    }
  }, [openQuickPanel, quickPanelController])

  return {
    enableWebSearch,
    providerItems,
    openQuickPanel,
    toggleQuickPanel,
    updateWebSearchProvider,
    updateToModelBuiltinWebSearch,
    selectedProviderId: assistant.webSearchProviderId
  }
}

interface ManagerProps {
  context: ToolRenderContext<any, any>
}

const WebSearchQuickPanelManager = ({ context }: ManagerProps) => {
  const { assistant, quickPanel, quickPanelController } = context
  const { providerItems, openQuickPanel } = useWebSearchPanelController(assistant.id, quickPanelController)
  const { registerRootMenu, registerTrigger } = quickPanel
  const { updateList, isVisible, symbol } = quickPanelController

  useEffect(() => {
    if (isVisible && symbol === QuickPanelReservedSymbol.WebSearch) {
      updateList(providerItems)
    }
  }, [isVisible, providerItems, symbol, updateList])

  useEffect(() => {
    const disposeMenu = registerRootMenu([
      {
        label: '网络搜索',
        description: '',
        icon: <Globe size={18} />,
        isMenu: true,
        action: () => openQuickPanel()
      }
    ])

    const disposeTrigger = registerTrigger(QuickPanelReservedSymbol.WebSearch, () => openQuickPanel())

    return () => {
      disposeMenu()
      disposeTrigger()
    }
  }, [openQuickPanel, registerRootMenu, registerTrigger])

  return null
}

export default WebSearchQuickPanelManager
