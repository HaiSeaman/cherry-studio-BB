import { loggerService } from '@logger'
import type { WebSearchState } from '@renderer/store/websearch'
import type { WebSearchProvider, WebSearchProviderResponse } from '@renderer/types'
import { fetchWebContent, noContent } from '@renderer/utils/fetch'
import axios from 'axios'

import BaseWebSearchProvider from './BaseWebSearchProvider'

const logger = loggerService.withContext('SearxngProvider')

export default class SearxngProvider extends BaseWebSearchProvider {
  private engines: string[] = []
  private readonly basicAuthUsername?: string
  private readonly basicAuthPassword: string
  private isInitialized = false

  constructor(provider: WebSearchProvider) {
    super(provider)
    if (!provider.apiHost) {
      throw new Error('API host is required for SearXNG provider')
    }

    this.apiHost = provider.apiHost
    this.basicAuthUsername = provider.basicAuthUsername
    this.basicAuthPassword = provider.basicAuthPassword ?? ''

    this.initEngines().catch((err) => logger.error('Failed to initialize SearXNG engines:', err))
  }
  private async initEngines(): Promise<void> {
    try {
      logger.info(`Initializing SearxNG with API host: ${this.apiHost}`)
      const auth = this.basicAuthUsername
        ? {
            username: this.basicAuthUsername,
            password: this.basicAuthPassword
          }
        : undefined
      const response = await axios.get(`${this.apiHost}/config`, {
        timeout: 5000,
        validateStatus: (status) => status === 200, // 仅接受 200 状态码
        auth
      })

      if (!response.data) {
        throw new Error('Empty response from SearxNG config endpoint')
      }

      if (!Array.isArray(response.data.engines)) {
        throw new Error('Invalid response format: "engines" property not found or not an array')
      }

      const allEngines = response.data.engines
      logger.info(`Found ${allEngines.length} total engines in SearxNG`)

      this.engines = allEngines
        .filter(
          (engine: { enabled: boolean; categories: string[]; name: string }) =>
            engine.enabled &&
            Array.isArray(engine.categories) &&
            engine.categories.includes('general') &&
            engine.categories.includes('web')
        )
        .map((engine) => engine.name)

      if (this.engines.length === 0) {
        throw new Error('No enabled general web search engines found in SearxNG configuration')
      }

      this.isInitialized = true
      logger.info(`SearxNG initialized successfully with ${this.engines.length} engines: ${this.engines.join(', ')}`)
    } catch (err) {
      this.isInitialized = false

      logger.error('Failed to fetch SearxNG engine configuration:', err as Error)
      throw new Error(`Failed to initialize SearxNG: ${err}`)
    }
  }

  public async search(query: string, websearch: WebSearchState): Promise<WebSearchProviderResponse> {
    try {
      if (!query) {
        throw new Error('Search query cannot be empty')
      }

      // Wait for initialization if it's the first search
      if (!this.isInitialized) {
        await this.initEngines().catch(() => {}) // Ignore errors
      }

      const result = await axios.get(`${this.apiHost}/search`, {
        params: {
          q: query,
          engines: this.engines.join(','),
          language: 'auto',
          format: 'json'
        },
        timeout: 15000,
        validateStatus: (status) => status === 200, // 仅接受 200 状态码
        auth: this.basicAuthUsername
          ? { username: this.basicAuthUsername, password: this.basicAuthPassword }
          : undefined
      })

      const searchResults = result.data?.results
      if (!Array.isArray(searchResults)) {
        throw new Error('Invalid search results from SearxNG')
      }

      const validItems = searchResults
        .filter((item) => item.url?.startsWith('http') || item.url?.startsWith('https'))
        .slice(0, websearch.maxResults)

      // Fetch content for each URL concurrently
      const fetchPromises = validItems.map(async (item) => {
        return await fetchWebContent(item.url, 'markdown', this.provider.usingBrowser)
      })

      // Wait for all fetches to complete
      const results = await Promise.all(fetchPromises)

      return {
        query: query,
        results: results.filter((result) => result.content != noContent)
      }
    } catch (error) {
      logger.error('Searxng search failed:', error as Error)
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
