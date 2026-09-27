import type { ToolSet } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { escapeXml, ToolExecutor } from '../ToolExecutor'
import type { ToolUseResult } from '../type'

describe('ToolExecutor', () => {
  describe('escapeXml', () => {
    it('should serialize the Error message instead of an empty object', () => {
      const result = escapeXml(new Error('boom'))

      // JSON.stringify(new Error('boom')) === '{}'，修复后应包含可读的失败原因
      expect(result).toContain('boom')
      expect(result).not.toBe('{}')
    })

    it('should include the cause message when present', () => {
      const error = Object.assign(new Error('outer failure'), { cause: new Error('inner failure') })

      const result = escapeXml(error)

      expect(result).toContain('outer failure')
      expect(result).toContain('inner failure')
    })

    it('should still escape XML special characters', () => {
      expect(escapeXml('<tag attr="v">&</tag>')).toBe('&lt;tag attr=&quot;v&quot;&gt;&amp;&lt;/tag&gt;')
    })

    it('should JSON-serialize plain objects', () => {
      expect(escapeXml({ ok: true })).toContain('&quot;ok&quot;:true')
    })
  })

  describe('error handling', () => {
    it('should expose readable error text in both the stream chunk and formatted output', async () => {
      const failingTool = {
        description: 'failing tool',
        inputSchema: {},
        execute: vi.fn(async () => {
          throw new Error('tool boom')
        })
      } as unknown as ToolSet[string]

      const tools: ToolSet = { failing_tool: failingTool }
      const chunks: any[] = []
      const controller = { enqueue: (chunk: any) => chunks.push(chunk) }

      const toolUses: ToolUseResult[] = [
        { id: 'call-1', toolName: 'failing_tool', arguments: {}, status: 'pending' }
      ]

      const executor = new ToolExecutor()
      const results = await executor.executeTools(toolUses, tools, controller)

      // tool-error 流分片只放可读文本，避免暴露原始 Error 对象
      const errorChunk = chunks.find((chunk) => chunk.type === 'tool-error')
      expect(errorChunk).toBeDefined()
      expect(errorChunk.error).toBe('tool boom')
      expect(errorChunk.error).not.toBeInstanceOf(Error)

      // 格式化后的结果包含失败原因，而不是空对象 {}
      const formatted = executor.formatToolResults(results)
      expect(formatted).toContain('tool boom')
      expect(formatted).not.toContain('<error>{}</error>')
    })
  })
})