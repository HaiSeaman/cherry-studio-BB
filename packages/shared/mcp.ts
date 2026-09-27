/** 确定性 32 位 FNV-1a 哈希，输出 8 位十六进制（不依赖 crypto，跨环境稳定）。 */
function shortHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Convert a string to camelCase, ensuring it's a valid JavaScript identifier.
 *
 * - Normalizes to lowercase first, then capitalizes word boundaries
 * - Non-alphanumeric characters are treated as word separators
 * - Output is always ASCII (`[a-zA-Z0-9_]`), because the function names built from
 *   this value are sent to model providers, and OpenAI/Anthropic only accept
 *   `^[a-zA-Z0-9_-]{1,64}$` — a non-ASCII name makes the whole request fail.
 * - Non-ASCII characters cannot be kept, so instead of silently dropping them
 *   (which would collapse every Chinese name to the same value) a deterministic
 *   hash suffix is appended, keeping different inputs distinct and stable.
 * - If result starts with a digit, prefixes with underscore
 * - A non-empty input that yields nothing usable (e.g. only symbols/emoji) also
 *   falls back to the deterministic hash, so no empty function name is produced.
 *
 * @example
 * toCamelCase('my-server') // 'myServer'
 * toCamelCase('MY_SERVER') // 'myServer'
 * toCamelCase('123tool')   // '_123tool'
 * toCamelCase('工具')      // '_<hash8>' (ASCII-safe, deterministic)
 * toCamelCase('我的-server') // 'server_<hash8>'
 */
export function toCamelCase(str: string): string {
  const normalized = str.trim()
  if (!normalized) {
    return ''
  }

  let result = normalized
    .toLowerCase()
    // 非字母/数字视为单词分隔符，并把分隔符后的字符转大写
    .replace(/[^a-z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    // 删除残留的符号与非 ASCII 字符，保证输出是纯 ASCII
    .replace(/[^a-zA-Z0-9]/g, '')

  // 输入含非 ASCII 字符时，上面会把它们整段丢掉（「工具」和「功能」都会变成空串），
  // 因此追加一段确定性短哈希，保证不同输入得到不同且稳定的名字。
  if (/\P{ASCII}/u.test(normalized)) {
    const suffix = shortHash(normalized)
    result = result ? `${result}_${suffix}` : `_${suffix}`
  }

  // 输入全是符号/emoji（如 '!!!'）：同样回退到哈希，避免产生空的函数名
  if (!result) {
    result = `_${shortHash(normalized)}`
  }

  if (!/^[a-zA-Z_]/.test(result)) {
    result = '_' + result
  }

  return result
}

export type McpToolNameOptions = {
  /** Prefix added before the name (e.g., 'mcp__'). Must be JS-identifier-safe. */
  prefix?: string
  /** Delimiter between server and tool parts (e.g., '_' or '__'). Must be JS-identifier-safe. */
  delimiter?: string
  /** Maximum length of the final name. Suffix numbers for uniqueness are included in this limit. */
  maxLength?: number
  /** Mutable Set for collision detection. The final name will be added to this Set. */
  existingNames?: Set<string>
}

/**
 * Build a valid JavaScript function name from server and tool names.
 * Uses camelCase for both parts.
 *
 * @param serverName - The MCP server name (optional)
 * @param toolName - The tool name
 * @param options - Configuration options
 * @returns A valid JS identifier
 */
export function buildMcpToolName(
  serverName: string | undefined,
  toolName: string,
  options: McpToolNameOptions = {}
): string {
  const { prefix = '', delimiter = '_', maxLength, existingNames } = options

  const serverPart = serverName ? toCamelCase(serverName) : ''
  const toolPart = toCamelCase(toolName)
  const baseName = serverPart ? `${prefix}${serverPart}${delimiter}${toolPart}` : `${prefix}${toolPart}`

  if (!existingNames) {
    return maxLength ? truncateToLength(baseName, maxLength) : baseName
  }

  let name = maxLength ? truncateToLength(baseName, maxLength) : baseName
  let counter = 1

  while (existingNames.has(name)) {
    const suffix = String(counter)
    const truncatedBase = maxLength ? truncateToLength(baseName, maxLength - suffix.length) : baseName
    name = `${truncatedBase}${suffix}`
    counter++
  }

  existingNames.add(name)
  return name
}

function truncateToLength(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength).replace(/_+$/, '')
}

/**
 * Generate a unique function name from server name and tool name.
 * Format: serverName_toolName (camelCase)
 *
 * @example
 * generateMcpToolFunctionName('github', 'search_issues') // 'github_searchIssues'
 */
export function generateMcpToolFunctionName(
  serverName: string | undefined,
  toolName: string,
  existingNames?: Set<string>
): string {
  return buildMcpToolName(serverName, toolName, { existingNames })
}

/**
 * Builds a valid JavaScript function name for MCP tool calls.
 * Format: mcp__{serverName}__{toolName}
 *
 * @param serverName - The MCP server name
 * @param toolName - The tool name from the server
 * @param existingNames - Optional mutable Set of names already used by the same
 *   server. When provided, collisions (e.g. two long names truncated to the same
 *   63 chars) are resolved by appending a numeric suffix and the final name is
 *   registered into the Set, so callers never silently map two tools to one name.
 * @returns A valid JS identifier in format mcp__{server}__{tool}, max 63 chars
 *
 * @example
 * buildFunctionCallToolName('github', 'search_issues') // 'mcp__github__searchIssues'
 */
export function buildFunctionCallToolName(
  serverName: string,
  toolName: string,
  existingNames?: Set<string>
): string {
  return buildMcpToolName(serverName, toolName, {
    prefix: 'mcp__',
    delimiter: '__',
    maxLength: 63,
    existingNames
  })
}
