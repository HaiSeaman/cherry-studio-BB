import { buildFunctionCallToolName, buildMcpToolName, generateMcpToolFunctionName, toCamelCase } from '@shared/mcp'
import { describe, expect, it } from 'vitest'

describe('toCamelCase', () => {
  it('should convert hyphenated strings', () => {
    expect(toCamelCase('my-server')).toBe('myServer')
    expect(toCamelCase('my-tool-name')).toBe('myToolName')
  })

  it('should convert underscored strings', () => {
    expect(toCamelCase('my_server')).toBe('myServer')
    expect(toCamelCase('search_issues')).toBe('searchIssues')
  })

  it('should handle mixed delimiters', () => {
    expect(toCamelCase('my-server_name')).toBe('myServerName')
  })

  it('should handle leading numbers by prefixing underscore', () => {
    expect(toCamelCase('123server')).toBe('_123server')
  })

  it('should handle special characters', () => {
    expect(toCamelCase('test@server!')).toBe('testServer')
    expect(toCamelCase('tool#name$')).toBe('toolName')
  })

  it('should trim whitespace', () => {
    expect(toCamelCase('  server  ')).toBe('server')
  })

  it('should handle empty string', () => {
    expect(toCamelCase('')).toBe('')
  })

  it('should handle uppercase snake case', () => {
    expect(toCamelCase('MY_SERVER')).toBe('myServer')
    expect(toCamelCase('SEARCH_ISSUES')).toBe('searchIssues')
  })

  it('should handle mixed case', () => {
    expect(toCamelCase('MyServer')).toBe('myserver')
    expect(toCamelCase('myTOOL')).toBe('mytool')
  })

  it('should keep non-ASCII names ASCII-safe, distinct and stable', () => {
    // 模型服务商只接受 ^[a-zA-Z0-9_-]+$ 的函数名，因此中文不能原样保留
    const zh = toCamelCase('工具')
    expect(zh).toMatch(/^_[0-9a-f]{8}$/)
    // 同一输入稳定
    expect(zh).toBe(toCamelCase('工具'))
    // 不同输入不塌缩成同一个名字
    expect(zh).not.toBe(toCamelCase('功能'))
    expect(toCamelCase('我的服务器')).not.toBe(zh)

    // 含 ASCII 片段时保留可读部分，再追加哈希
    const mixed = toCamelCase('我的-server')
    expect(mixed).toMatch(/^server_[0-9a-f]{8}$/i)
    expect(toCamelCase('工具-名称')).toMatch(/^_[0-9a-f]{8}$/)
    expect(toCamelCase('工具_名称')).toMatch(/^_[0-9a-f]{8}$/)
  })

  it('should fall back to a deterministic hash when no letters/digits remain', () => {
    const first = toCamelCase('!!!')
    const second = toCamelCase('!!!')
    // 非空且稳定：同一输入得到相同结果，不同输入得到不同结果
    expect(first).toMatch(/^_[0-9a-f]{8}$/)
    expect(first).toBe(second)
    expect(first).not.toBe('')
    expect(toCamelCase('???')).not.toBe(first)
  })
})

describe('buildMcpToolName', () => {
  it('should build basic name with defaults', () => {
    expect(buildMcpToolName('github', 'search_issues')).toBe('github_searchIssues')
  })

  it('should handle undefined server name', () => {
    expect(buildMcpToolName(undefined, 'search_issues')).toBe('searchIssues')
  })

  it('should apply custom prefix and delimiter', () => {
    expect(buildMcpToolName('github', 'search', { prefix: 'mcp__', delimiter: '__' })).toBe('mcp__github__search')
  })

  it('should respect maxLength', () => {
    const result = buildMcpToolName('veryLongServerName', 'veryLongToolName', { maxLength: 20 })
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('should handle collision with existingNames', () => {
    const existingNames = new Set(['github_search'])
    const result = buildMcpToolName('github', 'search', { existingNames })
    expect(result).toBe('github_search1')
    expect(existingNames.has('github_search1')).toBe(true)
  })

  it('should respect maxLength when adding collision suffix', () => {
    const existingNames = new Set(['a'.repeat(20)])
    const result = buildMcpToolName('a'.repeat(20), '', { maxLength: 20, existingNames })
    expect(result.length).toBeLessThanOrEqual(20)
    expect(existingNames.has(result)).toBe(true)
  })

  it('should handle multiple collisions with maxLength', () => {
    const existingNames = new Set(['abcd', 'abc1', 'abc2'])
    const result = buildMcpToolName('abcd', '', { maxLength: 4, existingNames })
    expect(result).toBe('abc3')
    expect(result.length).toBeLessThanOrEqual(4)
  })
})

describe('generateMcpToolFunctionName', () => {
  it('should return format serverName_toolName in camelCase', () => {
    expect(generateMcpToolFunctionName('github', 'search_issues')).toBe('github_searchIssues')
  })

  it('should handle hyphenated names', () => {
    expect(generateMcpToolFunctionName('my-server', 'my-tool')).toBe('myServer_myTool')
  })

  it('should handle undefined server name', () => {
    expect(generateMcpToolFunctionName(undefined, 'search_issues')).toBe('searchIssues')
  })

  it('should handle collision detection', () => {
    const existingNames = new Set<string>()
    const first = generateMcpToolFunctionName('github', 'search', existingNames)
    const second = generateMcpToolFunctionName('github', 'search', existingNames)
    expect(first).toBe('github_search')
    expect(second).toBe('github_search1')
  })
})

describe('buildFunctionCallToolName', () => {
  describe('basic format', () => {
    it('should return format mcp__{server}__{tool} in camelCase', () => {
      const result = buildFunctionCallToolName('github', 'search_issues')
      expect(result).toBe('mcp__github__searchIssues')
    })

    it('should handle simple server and tool names', () => {
      expect(buildFunctionCallToolName('fetch', 'get_page')).toBe('mcp__fetch__getPage')
      expect(buildFunctionCallToolName('database', 'query')).toBe('mcp__database__query')
    })
  })

  describe('valid JavaScript identifier', () => {
    it('should always start with mcp__ prefix (valid JS identifier start)', () => {
      const result = buildFunctionCallToolName('123server', '456tool')
      expect(result).toMatch(/^mcp__/)
    })

    it('should handle hyphenated names with camelCase', () => {
      const result = buildFunctionCallToolName('my-server', 'my-tool')
      expect(result).toBe('mcp__myServer__myTool')
    })

    it('should be a valid JavaScript identifier', () => {
      const testCases = [
        ['github', 'create_issue'],
        ['my-server', 'fetch-data'],
        ['test@server', 'tool#name'],
        ['server.name', 'tool.action']
      ]

      for (const [server, tool] of testCases) {
        const result = buildFunctionCallToolName(server, tool)
        expect(result).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      }
    })
  })

  describe('character sanitization', () => {
    it('should convert special characters to camelCase boundaries', () => {
      expect(buildFunctionCallToolName('my-server', 'my-tool-name')).toBe('mcp__myServer__myToolName')
      expect(buildFunctionCallToolName('test@server!', 'tool#name$')).toBe('mcp__testServer__toolName')
      expect(buildFunctionCallToolName('server.name', 'tool.action')).toBe('mcp__serverName__toolAction')
    })

    it('should handle spaces', () => {
      const result = buildFunctionCallToolName('my server', 'my tool')
      expect(result).toBe('mcp__myServer__myTool')
    })
  })

  describe('length constraints', () => {
    it('should not exceed 63 characters', () => {
      const longServerName = 'a'.repeat(50)
      const longToolName = 'b'.repeat(50)
      const result = buildFunctionCallToolName(longServerName, longToolName)
      expect(result.length).toBeLessThanOrEqual(63)
    })

    it('should not end with underscores after truncation', () => {
      const longServerName = 'a'.repeat(30)
      const longToolName = 'b'.repeat(30)
      const result = buildFunctionCallToolName(longServerName, longToolName)
      expect(result).not.toMatch(/_+$/)
      expect(result.length).toBeLessThanOrEqual(63)
    })
  })

  describe('edge cases', () => {
    it('should handle empty server name', () => {
      const result = buildFunctionCallToolName('', 'tool')
      expect(result).toBe('mcp__tool')
    })

    it('should handle empty tool name', () => {
      const result = buildFunctionCallToolName('server', '')
      expect(result).toBe('mcp__server__')
    })

    it('should trim whitespace from names', () => {
      const result = buildFunctionCallToolName('  server  ', '  tool  ')
      expect(result).toBe('mcp__server__tool')
    })

    it('should handle mixed case by normalizing to lowercase first', () => {
      const result = buildFunctionCallToolName('MyServer', 'MyTool')
      expect(result).toBe('mcp__myserver__mytool')
    })

    it('should handle uppercase snake case', () => {
      const result = buildFunctionCallToolName('MY_SERVER', 'SEARCH_ISSUES')
      expect(result).toBe('mcp__myServer__searchIssues')
    })
  })

  describe('deterministic output', () => {
    it('should produce consistent results for same input', () => {
      const result1 = buildFunctionCallToolName('github', 'search_repos')
      const result2 = buildFunctionCallToolName('github', 'search_repos')
      expect(result1).toBe(result2)
    })

    it('should produce different results for different inputs', () => {
      const result1 = buildFunctionCallToolName('server1', 'tool')
      const result2 = buildFunctionCallToolName('server2', 'tool')
      expect(result1).not.toBe(result2)
    })
  })

  describe('real-world scenarios', () => {
    it('should handle GitHub MCP server', () => {
      expect(buildFunctionCallToolName('github', 'create_issue')).toBe('mcp__github__createIssue')
      expect(buildFunctionCallToolName('github', 'search_repositories')).toBe('mcp__github__searchRepositories')
    })

    it('should handle filesystem MCP server', () => {
      expect(buildFunctionCallToolName('filesystem', 'read_file')).toBe('mcp__filesystem__readFile')
      expect(buildFunctionCallToolName('filesystem', 'write_file')).toBe('mcp__filesystem__writeFile')
    })

    it('should handle hyphenated server names (common in npm packages)', () => {
      expect(buildFunctionCallToolName('cherry-fetch', 'get_page')).toBe('mcp__cherryFetch__getPage')
      expect(buildFunctionCallToolName('mcp-server-github', 'search')).toBe('mcp__mcpServerGithub__search')
    })

    it('should handle scoped npm package style names', () => {
      const result = buildFunctionCallToolName('@anthropic/mcp-server', 'chat')
      expect(result).toBe('mcp__AnthropicMcpServer__chat')
    })
  })

  describe('non-ASCII names (C3)', () => {
    it('should not collapse Chinese server/tool names to the bare prefix', () => {
      const result = buildFunctionCallToolName('我的服务器', '工具')
      // 必须仍是模型接口可接受的 ASCII 函数名，且不能塌缩成 'mcp__'
      expect(result).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      expect(result).not.toBe('mcp__')
      expect(result.startsWith('mcp__')).toBe(true)
    })

    it('should keep different Chinese tool names distinct', () => {
      expect(buildFunctionCallToolName('服务器', '工具')).not.toBe(buildFunctionCallToolName('服务器', '功能'))
    })
  })

  describe('collision resolution with existingNames (C3)', () => {
    it('should disambiguate two long names that truncate to the same 63 chars', () => {
      // 两个工具名仅在 63 字符截断点之后不同
      const sharedPrefix = 'x'.repeat(60)
      const toolA = `${sharedPrefix}${'a'.repeat(10)}`
      const toolB = `${sharedPrefix}${'b'.repeat(10)}`

      // 不传 existingNames 时会静默塌缩到同一个名字
      expect(buildFunctionCallToolName('server', toolA)).toBe(buildFunctionCallToolName('server', toolB))

      const existingNames = new Set<string>()
      const first = buildFunctionCallToolName('server', toolA, existingNames)
      const second = buildFunctionCallToolName('server', toolB, existingNames)

      expect(first).not.toBe(second)
      expect(first.length).toBeLessThanOrEqual(63)
      expect(second.length).toBeLessThanOrEqual(63)
      expect(existingNames.has(first)).toBe(true)
      expect(existingNames.has(second)).toBe(true)
    })
  })
})
