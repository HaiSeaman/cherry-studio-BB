import type { WebSearchResultBlock } from '@anthropic-ai/sdk/resources'
import type OpenAI from '@cherrystudio/openai'
import type { GroundingMetadata } from '@google/genai'
import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit'
import type { TodoWriteToolInput } from '@renderer/pages/home/Messages/Tools/MessageAgentTools/types'
import type {
  AISDKWebSearchResult,
  BaseTool,
  Citation,
  NormalToolResponse,
  WebSearchProviderResponse
} from '@renderer/types'
import { WEB_SEARCH_SOURCE } from '@renderer/types'
import type { CitationMessageBlock, MessageBlock, ToolMessageBlock } from '@renderer/types/newMessage'
import { MessageBlockType } from '@renderer/types/newMessage'

import type { RootState } from './index' // 确认 RootState 从 store/index.ts 导出

// Create a simplified type for the entity adapter to avoid circular type issues
type MessageBlockEntity = MessageBlock

// 1. 创建实体适配器 (Entity Adapter)
// 我们使用块的 `id` 作为唯一标识符。
const messageBlocksAdapter = createEntityAdapter<MessageBlockEntity>()

// 2. 使用适配器定义初始状态 (Initial State)
const initialState = messageBlocksAdapter.getInitialState()

// 3. 创建 Slice
// @ts-ignore ignore
export const messageBlocksSlice = createSlice({
  name: 'messageBlocks',
  initialState,
  reducers: {
    // 使用适配器的 reducer 助手进行 CRUD 操作。
    // 这些 reducer 会自动处理规范化的状态结构。

    /** 添加或更新单个块 (Upsert)。 */
    upsertOneBlock: messageBlocksAdapter.upsertOne, // 期望 MessageBlock 作为 payload

    /** 添加或更新多个块。用于加载消息。 */
    upsertManyBlocks: messageBlocksAdapter.upsertMany, // 期望 MessageBlock[] 作为 payload

    /** 根据 ID 移除单个块。 */
    removeOneBlock: messageBlocksAdapter.removeOne, // 期望 EntityId (string) 作为 payload

    /** 根据 ID 列表移除多个块。用于清理话题。 */
    removeManyBlocks: messageBlocksAdapter.removeMany, // 期望 EntityId[] (string[]) 作为 payload

    /** 移除所有块。用于完全重置。 */
    removeAllBlocks: messageBlocksAdapter.removeAll,

    // 注意：如果只想更新现有块，也可以使用 `updateOne`
    updateOneBlock: messageBlocksAdapter.updateOne // 期望 { id: EntityId, changes: Partial<MessageBlock> }
  }
  // 如果需要处理其他 slice 的 action，可以在这里添加 extraReducers。
})

// 4. 导出 Actions 和 Reducer
export const { upsertOneBlock, upsertManyBlocks, removeOneBlock, removeManyBlocks, removeAllBlocks, updateOneBlock } =
  messageBlocksSlice.actions

export const messageBlocksSelectors = messageBlocksAdapter.getSelectors<RootState>(
  (state) => state.messageBlocks // Ensure this matches the key in the root reducer
)

// --- Selector Integration --- START

// Selector to get the raw block entity by ID
const selectBlockEntityById = (state: RootState, blockId: string | undefined): MessageBlock | undefined => {
  const entity = blockId ? messageBlocksSelectors.selectById(state, blockId) : undefined
  if (!entity) return undefined

  // Convert back to full MessageBlock type
  return entity
}

// --- Centralized Citation Formatting Logic ---
export const formatCitationsFromBlock = (block: CitationMessageBlock | undefined): Citation[] => {
  if (!block) return []

  let formattedCitations: Citation[] = []
  // 1. Handle Web Search Responses
  if (block.response) {
    switch (block.response.source) {
      case WEB_SEARCH_SOURCE.GEMINI: {
        const groundingMetadata = block.response.results as GroundingMetadata
        formattedCitations =
          groundingMetadata?.groundingChunks?.map((chunk, index) => ({
            number: index + 1,
            url: chunk?.web?.uri || '',
            title: chunk?.web?.title,
            showFavicon: true,
            metadata: groundingMetadata.groundingSupports,
            type: 'websearch'
          })) || []
        break
      }
      case WEB_SEARCH_SOURCE.OPENAI_RESPONSE:
        formattedCitations =
          (block.response.results as OpenAI.Responses.ResponseOutputText.URLCitation[])?.map((result, index) => {
            let hostname: string | undefined
            try {
              hostname = result.title ? undefined : new URL(result.url).hostname
            } catch {
              hostname = result.url
            }
            return {
              number: index + 1,
              url: result.url,
              title: result.title,
              hostname: hostname,
              showFavicon: true,
              type: 'websearch'
            }
          }) || []
        break
      case WEB_SEARCH_SOURCE.OPENAI:
        formattedCitations =
          (block.response.results as OpenAI.Chat.Completions.ChatCompletionMessage.Annotation[])?.map((url, index) => {
            const urlCitation = url.url_citation
            let hostname: string | undefined
            try {
              hostname = urlCitation.title ? undefined : new URL(urlCitation.url).hostname
            } catch {
              hostname = urlCitation.url
            }
            return {
              number: index + 1,
              url: urlCitation.url,
              title: urlCitation.title,
              hostname: hostname,
              showFavicon: true,
              type: 'websearch'
            }
          }) || []
        break
      case WEB_SEARCH_SOURCE.ANTHROPIC:
        formattedCitations =
          (block.response.results as Array<WebSearchResultBlock>)?.map((result, index) => {
            const { url } = result
            let hostname: string | undefined
            try {
              hostname = new URL(url).hostname
            } catch {
              hostname = url
            }
            return {
              number: index + 1,
              url: url,
              title: result.title,
              hostname: hostname,
              showFavicon: true,
              type: 'websearch'
            }
          }) || []
        break
      case WEB_SEARCH_SOURCE.PERPLEXITY: {
        formattedCitations =
          (block.response.results as any[])?.map((result, index) => {
            const url = result.url || result // 兼容旧数据
            let title = result.title
            if (!title) {
              try {
                title = new URL(url).hostname
              } catch {
                title = url
              }
            }
            return {
              number: index + 1,
              url: url,
              title: title,
              showFavicon: true,
              type: 'websearch'
            }
          }) || []
        break
      }
      case WEB_SEARCH_SOURCE.GROK:
        formattedCitations =
          (block.response.results as AISDKWebSearchResult[])?.map((result, index) => {
            const url = result.url
            try {
              const hostname = new URL(result.url).hostname
              // xAI source events use citation number as title, fall back to hostname
              const title = result.title && /^\d+$/.test(result.title) ? hostname : result.title || hostname
              return {
                number: index + 1,
                url,
                title,
                showFavicon: true,
                type: 'websearch'
              }
            } catch {
              return {
                number: index + 1,
                url,
                hostname: url,
                showFavicon: true,
                type: 'websearch'
              }
            }
          }) || []
        break
      case WEB_SEARCH_SOURCE.OPENROUTER:
        formattedCitations =
          (block.response.results as AISDKWebSearchResult[])?.map((result, index) => {
            const url = result.url
            try {
              const hostname = new URL(result.url).hostname
              const content = result.providerMetadata && result.providerMetadata['openrouter']?.content
              return {
                number: index + 1,
                url,
                title: result.title || hostname,
                content: content as string,
                showFavicon: true,
                type: 'websearch'
              }
            } catch {
              return {
                number: index + 1,
                url,
                hostname: url,
                showFavicon: true,
                type: 'websearch'
              }
            }
          }) || []
        break
      case WEB_SEARCH_SOURCE.ZHIPU:
      case WEB_SEARCH_SOURCE.HUNYUAN:
        formattedCitations =
          (block.response.results as any[])?.map((result, index) => ({
            number: index + 1,
            url: result.link || result.url,
            title: result.title,
            showFavicon: true,
            type: 'websearch'
          })) || []
        break
      case WEB_SEARCH_SOURCE.WEBSEARCH:
        formattedCitations =
          (block.response.results as WebSearchProviderResponse)?.results?.map((result, index) => ({
            number: index + 1,
            url: result.url,
            title: result.title,
            content: result.content,
            showFavicon: true,
            type: 'websearch'
          })) || []
        break
      case WEB_SEARCH_SOURCE.AISDK:
        formattedCitations =
          (block.response?.results as AISDKWebSearchResult[])?.map((result, index) => ({
            number: index + 1,
            url: result.url,
            title: result.title || new URL(result.url).hostname,
            showFavicon: true,
            type: 'websearch',
            providerMetadata: result?.providerMetadata
          })) || []
        break
    }
  }

  if (block.memories && Array.isArray(block.memories) && block.memories.length > 0) {
    // 5. Handle Memory References
    formattedCitations.push(
      ...block.memories.map((memory, index) => ({
        number: index + 1,
        url: '',
        title: `Memory ${memory.hash?.slice(0, 8)}`,
        content: memory.memory,
        showFavicon: false,
        type: 'memory'
      }))
    )
  }

  // 4. Deduplicate non-knowledge citations by URL and Renumber Sequentially
  const urlSet = new Set<string>()
  return formattedCitations
    .filter((citation) => {
      if (citation.type === 'memory') return true
      if (!citation.url || urlSet.has(citation.url)) return false
      urlSet.add(citation.url)
      return true
    })
    .map((citation, index) => ({
      ...citation,
      number: index + 1
    }))
}
// --- End of Centralized Logic ---

// Memoized selector that takes a block ID and returns formatted citations
export const selectFormattedCitationsByBlockId = createSelector([selectBlockEntityById], (blockEntity): Citation[] => {
  if (blockEntity?.type === MessageBlockType.CITATION) {
    return formatCitationsFromBlock(blockEntity)
  }
  return []
})

// --- Active TodoWrite Block Selector ---
export interface TodoWriteNormalToolResponse extends Omit<NormalToolResponse, 'tool' | 'arguments'> {
  tool: BaseTool & { name: 'TodoWrite' }
  arguments: TodoWriteToolInput
}

export interface TodoWriteToolMessageBlock extends Omit<ToolMessageBlock, 'metadata'> {
  metadata: NonNullable<ToolMessageBlock['metadata']> & {
    rawMcpToolResponse: TodoWriteNormalToolResponse
  }
}

/**
 * Check if a block is a TodoWrite tool block
 */
export const isTodoWriteBlock = (block: MessageBlock | undefined): block is TodoWriteToolMessageBlock => {
  if (!block || block.type !== MessageBlockType.TOOL) return false
  const toolResponse = block.metadata?.rawMcpToolResponse
  if (toolResponse?.tool?.name !== 'TodoWrite') return false
  // Defensive: validate todos is actually an array to prevent dirty data from crashing selectors (#12804)
  const args = toolResponse.arguments
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false
  return Array.isArray(args.todos)
}

// --- Selector Integration --- END

export default messageBlocksSlice.reducer
