import { CacheService } from '@main/services/CacheService'
import type { MCPServer } from '@types'

import { loggerService } from '../LoggerService'
import { reduxService } from '../ReduxService'

const logger = loggerService.withContext('McpUtils')

// Cache configuration
const MCP_SERVERS_CACHE_KEY = 'api-server:mcp-servers'
const MCP_SERVERS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get MCP servers from the Redux store, with caching.
 */
export async function getMCPServersFromRedux(): Promise<MCPServer[]> {
  try {
    logger.debug('Getting servers from Redux store')

    // Try to get from cache first (faster)
    const cachedServers = CacheService.get<MCPServer[]>(MCP_SERVERS_CACHE_KEY)
    if (cachedServers) {
      logger.debug('MCP servers resolved from cache', { count: cachedServers.length })
      return cachedServers
    }

    // If cache is not available, get fresh data from Redux
    const servers = await reduxService.select<MCPServer[]>('state.mcp.servers')
    const serverList = servers || []

    // Cache the results
    CacheService.set(MCP_SERVERS_CACHE_KEY, serverList, MCP_SERVERS_CACHE_TTL)

    logger.debug('Fetched servers from Redux store', { count: serverList.length })
    return serverList
  } catch (error: any) {
    logger.error('Failed to get servers from Redux', { error })
    return []
  }
}
