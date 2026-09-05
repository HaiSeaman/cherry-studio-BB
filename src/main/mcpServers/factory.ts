import { loggerService } from '@logger'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { BuiltinMCPServerName } from '@types'
import { BuiltinMCPServerNames } from '@types'

import BraveSearchServer from './brave-search'
import BrowserServer from './browser'
import DiDiMcpServer from './didi-mcp'
import DifyKnowledgeServer from './dify-knowledge'
import FetchServer from './fetch'
import FileSystemServer from './filesystem'
import { resolveFilesystemBaseDir } from './filesystem/config'
import HubServer from './hub'
import MemoryServer from './memory'
import ThinkingServer from './sequentialthinking'

const logger = loggerService.withContext('MCPFactory')

// 生命周期较长的进程级单例（构造器会注册 app/nativeTheme 等进程级监听器，
// 每次 new 都会累积监听器导致泄漏，故必须单例化复用）。
const browserServerSingleton = new BrowserServer()

// 打印 envs 时脱敏密钥，避免 API Key 落盘日志
function redactEnvs(envs: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {}
  for (const [key, value] of Object.entries(envs)) {
    redacted[key] = /KEY|TOKEN|SECRET|PASSWORD|API/i.test(key) && value ? '***' : value
  }
  return redacted
}

export function createInMemoryMCPServer(
  name: BuiltinMCPServerName,
  args: string[] = [],
  envs: Record<string, string> = {}
): Server {
  logger.debug(
    `[MCP] Creating in-memory MCP server: ${name} with args: ${args} and envs: ${JSON.stringify(redactEnvs(envs))}`
  )
  switch (name) {
    case BuiltinMCPServerNames.memory: {
      const envPath = envs.MEMORY_FILE_PATH
      return new MemoryServer(envPath).server
    }
    case BuiltinMCPServerNames.sequentialThinking: {
      return new ThinkingServer().server
    }
    case BuiltinMCPServerNames.braveSearch: {
      return new BraveSearchServer(envs.BRAVE_API_KEY).server
    }
    case BuiltinMCPServerNames.fetch: {
      return new FetchServer().server
    }
    case BuiltinMCPServerNames.filesystem: {
      return new FileSystemServer(resolveFilesystemBaseDir(args, envs)).server
    }
    case BuiltinMCPServerNames.difyKnowledge: {
      const difyKey = envs.DIFY_KEY
      return new DifyKnowledgeServer(difyKey, args).server
    }
    case BuiltinMCPServerNames.didiMCP: {
      const apiKey = envs.DIDI_API_KEY
      return new DiDiMcpServer(apiKey).server
    }
    case BuiltinMCPServerNames.browser: {
      return browserServerSingleton.server
    }
    case BuiltinMCPServerNames.hub: {
      return new HubServer().server
    }
    default:
      throw new Error(`Unknown in-memory MCP server: ${name}`)
  }
}
