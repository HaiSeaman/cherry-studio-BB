import type { CollapseProps } from 'antd'
import { Tag } from 'antd'
import { CheckCircle, Terminal, XCircle } from 'lucide-react'

import { truncateOutput } from '../shared/truncateOutput'
import { ToolHeader, TruncatedIndicator } from './GenericTools'
import { TerminalOutput } from './TerminalOutput'
import type { BashOutputToolInput, BashOutputToolOutput } from './types'
import { AgentToolsType } from './types'

interface ParsedBashOutput {
  status?: string
  exit_code?: number
  stdout?: string
  stderr?: string
  timestamp?: string
  tool_use_error?: string
}

const parseBashOutput = (output?: BashOutputToolOutput): ParsedBashOutput | null => {
  if (!output) return null

  try {
    const parser = new DOMParser()
    const hasToolError = output.includes('<tool_use_error>')
    const xmlStr = output.includes('<status>') || hasToolError ? `<root>${output}</root>` : output
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml')
    const parserError = xmlDoc.querySelector('parsererror')
    if (parserError) return null

    const getElementText = (tagName: string): string | undefined => {
      const element = xmlDoc.getElementsByTagName(tagName)[0]
      return element?.textContent?.trim()
    }

    return {
      status: getElementText('status'),
      exit_code: getElementText('exit_code') ? parseInt(getElementText('exit_code')!) : undefined,
      stdout: getElementText('stdout'),
      stderr: getElementText('stderr'),
      timestamp: getElementText('timestamp'),
      tool_use_error: getElementText('tool_use_error')
    }
  } catch {
    return null
  }
}

export function BashOutputTool({
  input,
  output
}: {
  input?: BashOutputToolInput
  output?: BashOutputToolOutput
}): NonNullable<CollapseProps['items']>[number] {
  const parsedOutput = parseBashOutput(output)

  const getStatusConfig = (parsed: ParsedBashOutput | null) => {
    if (!parsed) return null

    if (parsed.tool_use_error) {
      return {
        color: 'danger',
        icon: <XCircle className="h-3.5 w-3.5" />,
        text: '错误'
      } as const
    }

    const isCompleted = parsed.status === 'completed'
    const isSuccess = parsed.exit_code === 0

    if (isCompleted && isSuccess) {
      return {
        color: 'success',
        icon: <CheckCircle className="h-3.5 w-3.5" />,
        text: '成功'
      } as const
    }

    if (isCompleted) {
      return {
        color: 'danger',
        icon: <XCircle className="h-3.5 w-3.5" />,
        text: '失败'
      } as const
    }

    return {
      color: 'warning',
      icon: <Terminal className="h-3.5 w-3.5" />,
      text: '运行中'
    } as const
  }

  const statusConfig = getStatusConfig(parsedOutput)

  // Truncate stdout and stderr separately
  const truncatedStdout = truncateOutput(parsedOutput?.stdout)
  const truncatedStderr = truncateOutput(parsedOutput?.stderr)
  const truncatedError = truncateOutput(parsedOutput?.tool_use_error)
  const truncatedRawOutput = truncateOutput(output)

  const children = parsedOutput ? (
    <div className="flex flex-col gap-4">
      {/* Status Info */}
      <div className="flex flex-wrap items-center gap-2">
        {parsedOutput.exit_code !== undefined && (
          <Tag color={parsedOutput.exit_code === 0 ? 'success' : 'danger'}>
            {'退出码'}: {parsedOutput.exit_code}
          </Tag>
        )}
        {parsedOutput.timestamp && (
          <Tag className="py-0 font-mono text-xs">{new Date(parsedOutput.timestamp).toLocaleString()}</Tag>
        )}
      </div>

      {/* Standard Output */}
      {truncatedStdout.data && (
        <div>
          <div className="mb-2 font-medium text-default-600 text-xs">{'标准输出'}:</div>
          <TerminalOutput content={truncatedStdout.data} />
          {truncatedStdout.isTruncated && <TruncatedIndicator originalLength={truncatedStdout.originalLength} />}
        </div>
      )}

      {/* Standard Error */}
      {truncatedStderr.data && (
        <div className="border border-danger-200">
          <div className="mb-2 font-medium text-danger-600 text-xs">{'标准错误'}:</div>
          <TerminalOutput content={truncatedStderr.data} />
          {truncatedStderr.isTruncated && <TruncatedIndicator originalLength={truncatedStderr.originalLength} />}
        </div>
      )}

      {/* Tool Use Error */}
      {truncatedError.data && (
        <div className="border border-danger-200">
          <div className="mb-2 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-danger" />
            <span className="font-medium text-danger-600 text-xs">{'错误'}:</span>
          </div>
          <TerminalOutput content={truncatedError.data} />
          {truncatedError.isTruncated && <TruncatedIndicator originalLength={truncatedError.originalLength} />}
        </div>
      )}
    </div>
  ) : (
    // 原始输出（如果解析失败或非 XML 格式）
    truncatedRawOutput.data && (
      <div>
        <TerminalOutput content={truncatedRawOutput.data} />
        {truncatedRawOutput.isTruncated && <TruncatedIndicator originalLength={truncatedRawOutput.originalLength} />}
      </div>
    )
  )
  return {
    key: AgentToolsType.BashOutput,
    label: (
      <ToolHeader
        toolName={AgentToolsType.BashOutput}
        params={
          <div className="flex items-center gap-2">
            <Tag className="py-0 font-mono text-xs">{input?.bash_id}</Tag>
            {statusConfig && (
              <Tag
                color={statusConfig.color}
                icon={statusConfig.icon}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '2px'
                }}>
                {statusConfig.text}
              </Tag>
            )}
          </div>
        }
        variant="collapse-label"
        showStatus={false}
      />
    ),

    children: children
  }
}
