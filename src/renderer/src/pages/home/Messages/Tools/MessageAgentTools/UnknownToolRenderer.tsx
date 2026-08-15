import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CollapseProps } from 'antd'
import { Wrench } from 'lucide-react'

import { ToolArgsTable } from '../shared/ArgsTable'
import { ToolHeader } from './GenericTools'

interface UnknownToolProps {
  toolName: string
  input?: unknown
  output?: unknown
}

const getToolDisplayName = (name: string) => {
  if (name.startsWith('mcp__')) {
    const parts = name.substring(5).split('__')
    if (parts.length >= 2) {
      return `${parts[0]}:${parts.slice(1).join(':')}`
    }
  }
  return name
}

/**
 * Extract text-only preview from MCP CallToolResult.
 * Images are already rendered via IMAGE_COMPLETE, so only text is shown here.
 * Returns null if the output is not a valid CallToolResult.
 */
function extractMcpText(output: unknown): string | null {
  const result = CallToolResultSchema.safeParse(output)
  if (!result.success) return null

  const textParts: string[] = []
  for (const item of result.data.content) {
    if (item.type === 'text' && item.text) {
      textParts.push(item.text)
    }
  }
  return textParts.length > 0 ? textParts.join('\n\n') : null
}

/**
 * Fallback renderer for unknown tool types
 * Uses shared ArgsTable for consistent styling with MCP tools
 */
export function UnknownToolRenderer({
  toolName = '',
  input,
  output
}: UnknownToolProps): NonNullable<CollapseProps['items']>[number] {
  const getToolDescription = (name: string) => {
    if (name.startsWith('mcp__')) {
      return 'MCP 服务器工具'
    }
    return '工具'
  }

  // Normalize input/output for table display
  const normalizeArgs = (value: unknown): Record<string, unknown> | unknown[] | null => {
    if (value === undefined || value === null) return null
    if (typeof value === 'object') return value as Record<string, unknown> | unknown[]
    // Wrap primitive values
    return { value }
  }

  const normalizedInput = normalizeArgs(input)

  // Try MCP CallToolResult format first (text only, images rendered via IMAGE_COMPLETE)
  const mcpText = extractMcpText(output)
  const normalizedOutput = mcpText !== null ? { value: mcpText } : normalizeArgs(output)

  return {
    key: 'unknown-tool',
    label: (
      <ToolHeader
        toolName={getToolDisplayName(toolName)}
        icon={<Wrench className="h-4 w-4" />}
        params={getToolDescription(toolName)}
        variant="collapse-label"
        showStatus={false}
      />
    ),
    children: (
      <div className="space-y-1">
        {normalizedInput && <ToolArgsTable args={normalizedInput} title={'输入'} />}
        {normalizedOutput && <ToolArgsTable args={normalizedOutput} title={'输出'} />}
        {!normalizedInput && !normalizedOutput && (
          <div className="p-3 text-foreground-500 text-xs">{'此工具暂无可用数据'}</div>
        )}
      </div>
    )
  }
}
