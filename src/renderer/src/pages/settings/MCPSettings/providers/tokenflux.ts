import { loggerService } from '@logger'
import { nanoid } from '@reduxjs/toolkit'
import type { MCPServer } from '@renderer/types'
const logger = loggerService.withContext('TokenFluxSyncUtils')

// Token storage constants and utilities
const TOKEN_STORAGE_KEY = 'tokenflux_token'
export const TOKENFLUX_HOST = 'https://tokenflux.ai'

export const saveTokenFluxToken = (token: string): void => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export const getTokenFluxToken = (): string | null => {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export const clearTokenFluxToken = (): void => {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export const hasTokenFluxToken = (): boolean => {
  return !!getTokenFluxToken()
}

interface TokenFluxServerAuthSchemaApiKey {
  location: string
  name: string
  prefix: string
}

interface TokenFluxServer {
  name: string
  display_name?: string
  description?: string
  version: string
  categories?: string[]
  logo?: string
  security_schemes?: Record<string, unknown>
}

interface TokenFluxSyncResult {
  success: boolean
  message: string
  addedServers: MCPServer[]
  updatedServers: MCPServer[]
  allServers: MCPServer[]
  errorDetails?: string
}

// Function to fetch and process TokenFlux servers
export const syncTokenFluxServers = async (
  token: string,
  existingServers: MCPServer[]
): Promise<TokenFluxSyncResult> => {
  try {
    const response = await fetch(`${TOKENFLUX_HOST}/v1/mcps?enabled=true`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    })

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      clearTokenFluxToken()
      return {
        success: false,
        message: '同步未授权',
        addedServers: [],
        updatedServers: [],
        allServers: []
      }
    }

    // Handle server errors
    if (response.status === 500 || !response.ok) {
      return {
        success: false,
        message: '同步 MCP 服务器出错',
        addedServers: [],
        updatedServers: [],
        allServers: [],
        errorDetails: `Status: ${response.status}`
      }
    }

    // Process successful response
    const data = await response.json()
    const servers: TokenFluxServer[] = data.data || []

    if (servers.length === 0) {
      return {
        success: true,
        message: '无可用的 MCP 服务器',
        addedServers: [],
        updatedServers: [],
        allServers: []
      }
    }

    // Transform TokenFlux servers to MCP servers format
    const addedServers: MCPServer[] = []
    const updatedServers: MCPServer[] = []
    const allServers: MCPServer[] = []
    logger.debug('TokenFlux servers:', servers)
    for (const server of servers) {
      try {
        // Check if server already exists
        const existingServer = existingServers.find((s) => s.id === `@tokenflux/${server.name}`)

        const authHeaders = {}
        if (server.security_schemes && server.security_schemes.api_key) {
          const keyAuth = server.security_schemes.api_key as TokenFluxServerAuthSchemaApiKey
          if (keyAuth.location === 'header') {
            authHeaders[keyAuth.name] = `${keyAuth.prefix || ''} {set your key here}`.trim()
          }
        }

        const mcpServer: MCPServer = {
          id: `@tokenflux/${server.name}`,
          name: server.display_name || server.name || `TokenFlux Server ${nanoid()}`,
          description: server.description || '',
          type: 'streamableHttp',
          baseUrl: `${TOKENFLUX_HOST}/v1/mcps/${server.name}/mcp`,
          isActive: true,
          provider: 'TokenFlux',
          providerUrl: `${TOKENFLUX_HOST}/mcps/${server.name}`,
          logoUrl: server.logo || '',
          tags: server.categories || [],
          headers: authHeaders
        }

        if (existingServer) {
          // Update existing server with corrected URL and latest info
          updatedServers.push(mcpServer)
        } else {
          // Add new server
          addedServers.push(mcpServer)
        }
        allServers.push(mcpServer)
      } catch (err) {
        logger.error('Error processing TokenFlux server:', err as Error)
      }
    }
    return {
      success: true,
      message: '同步 MCP 服务器成功',
      addedServers,
      updatedServers,
      allServers
    }
  } catch (error) {
    logger.error('TokenFlux sync error:', error as Error)
    return {
      success: false,
      message: '同步 MCP 服务器出错',
      addedServers: [],
      updatedServers: [],
      allServers: [],
      errorDetails: String(error)
    }
  }
}
