import type { WebSearchState } from '@renderer/store/websearch'
import type { WebSearchProvider, WebSearchProviderResponse } from '@renderer/types'
import { filterResultWithBlacklist } from '@renderer/utils/blacklistMatchPattern'

import type BaseWebSearchProvider from './BaseWebSearchProvider'
import WebSearchProviderFactory from './WebSearchProviderFactory'

export default class WebSearchEngineProvider {
  private sdk: BaseWebSearchProvider

  constructor(provider: WebSearchProvider) {
    this.sdk = WebSearchProviderFactory.create(provider)
  }

  public async search(
    query: string,
    websearch: WebSearchState,
    httpOptions?: RequestInit
  ): Promise<WebSearchProviderResponse> {
    const callSearch = async ({ query, websearch }) => {
      return await this.sdk.search(query, websearch, httpOptions)
    }

    const result = await callSearch({ query, websearch })

    return await filterResultWithBlacklist(result, websearch)
  }
}
