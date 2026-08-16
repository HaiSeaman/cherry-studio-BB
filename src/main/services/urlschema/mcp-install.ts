import { loggerService } from '@logger'
import { nanoid } from '@reduxjs/toolkit'
import { IpcChannel } from '@shared/IpcChannel'
import type { MCPServer } from '@types'

import { windowService } from '../WindowService'

const logger = loggerService.withContext('URLSchema:handleMcpProtocolUrl')

function installMCPServer(server: MCPServer) {
  const mainWindow = windowService.getMainWindow()
  const now = Date.now()

  const payload: MCPServer = {
    ...server,
    id: server.id ?? nanoid(),
    installSource: 'protocol',
    isTrusted: false,
    isActive: false,
    trustedAt: undefined,
    installedAt: server.installedAt ?? now
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IpcChannel.Mcp_AddServer, payload)
  }
}

function installMCPServers(servers: Record<string, MCPServer>) {
  for (const name in servers) {
    const server = servers[name]
    if (!server.name) {
      server.name = name
    }
    installMCPServer(server)
  }
}

export function handleMcpProtocolUrl(url: URL) {
  switch (url.pathname) {
    case '/install': {
      // jsonConfig example:
      // {
      //   "mcpServers": {
      //     "everything": {
      //       "command": "npx",
      //       "args": [
      //         "-y",
      //         "@modelcontextprotocol/server-everything"
      //       ]
      //     }
      //   }
      // }
      // cherrystudio://mcp/install?servers={base64Encode(JSON.stringify(jsonConfig))}

      // URLSearchParams 会处理 + 和 /，base64 需先转义再还原（与 handle-providers 一致）
      const processedSearch = url.search.replaceAll('+', '_').replaceAll('/', '-')
      const params = new URLSearchParams(processedSearch)
      const data = params.get('servers')?.replaceAll('_', '+').replaceAll('-', '/')

      if (data) {
        const stringify = Buffer.from(data, 'base64').toString('utf8')
        logger.debug(`install MCP servers from urlschema: ${stringify}`)
        // 协议 URL 可被任意来源触发：损坏/伪造的 base64 内容解析失败时记录并忽略，不能抛出导致主进程崩溃
        let jsonConfig: any
        try {
          jsonConfig = JSON.parse(stringify)
        } catch (err) {
          logger.error('install MCP servers from urlschema: invalid JSON payload', err as Error)
          break
        }
        logger.debug(`install MCP servers from urlschema: ${JSON.stringify(jsonConfig)}`)

        // support both {mcpServers: [servers]}, [servers] and {server}
        if (jsonConfig.mcpServers) {
          installMCPServers(jsonConfig.mcpServers)
        } else if (Array.isArray(jsonConfig)) {
          for (const server of jsonConfig) {
            installMCPServer(server)
          }
        } else {
          installMCPServer(jsonConfig)
        }
      }

      windowService.getMainWindow()?.show()

      break
    }
    default:
      logger.error(`Unknown MCP protocol URL: ${url}`)
      break
  }
}
