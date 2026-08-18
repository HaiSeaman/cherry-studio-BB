// Bocha 搜索参数/响应类型（纯类型，运行时校验已移除：zod schema 从未被调用）

export interface BochaSearchParams {
  query: string
  /** 'oneDay' | 'oneWeek' | 'oneMonth' | 'oneYear' | 'noLimit' | 自定义日期/日期范围 */
  freshness?: string
  summary?: boolean
  /** 用 | 或 , 分隔的排除域名列表 */
  exclude?: string
  page?: number
  count?: number
}

export interface BochaWebPage {
  id: string
  name: string
  url: string
  displayUrl: string
  snippet: string
  summary?: string
  siteName: string
  siteIcon: string
  datePublished: string
  dateLastCrawled: string
  cachedPageUrl: string
  language: string
  isFamilyFriendly: boolean
  isNavigational: boolean
}

export interface BochaImage {
  webSearchUrl: string
  name: string
  thumbnailUrl: string
  datePublished: string
  contentUrl: string
  hostPageUrl: string
  contentSize: string
  encodingFormat: string
  hostPageDisplayUrl: string
  width: number
  height: number
  thumbnail: { width: number; height: number }
}

export interface BochaVideo {
  webSearchUrl: string
  name: string
  description: string
  thumbnailUrl: string
  publisher: string
  creator: string
  contentUrl: string
  hostPageUrl: string
  encodingFormat: string
  hostPageDisplayUrl: string
  width: number
  height: number
  duration: number
  motionThumbnailUrl: string
  embedHtml: string
  allowHttpsEmbed: boolean
  viewCount: number
  thumbnail: { width: number; height: number }
  allowMobileEmbed: boolean
  isSuperfresh: boolean
  datePublished: string
}

export interface BochaSearchResponse {
  code: number
  logId: string
  data: {
    type: string
    queryContext: { originalQuery: string }
    webPages: {
      webSearchUrl: string
      totalEstimatedMatches: number
      value: BochaWebPage[]
      someResultsRemoved: boolean
    }
    images: {
      id: string
      readLink: string
      webSearchUrl: string
      name: string
      value: BochaImage[]
    }
    videos: {
      id: string
      readLink: string
      webSearchUrl: string
      isFamilyFriendly: boolean
      scenario: string
      name: string
      value: BochaVideo[]
    }
  }
  msg?: string
}
