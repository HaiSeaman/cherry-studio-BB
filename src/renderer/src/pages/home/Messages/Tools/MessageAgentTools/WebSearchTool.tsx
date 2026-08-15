import type { CollapseProps } from 'antd'

import { countLines, truncateOutput } from '../shared/truncateOutput'
import { ToolHeader, TruncatedIndicator } from './GenericTools'
import { AgentToolsType, type WebSearchToolInput, type WebSearchToolOutput } from './types'

export function WebSearchTool({
  input,
  output
}: {
  input?: WebSearchToolInput
  output?: WebSearchToolOutput
}): NonNullable<CollapseProps['items']>[number] {
  const resultCount = output ? countLines(output) : 0
  const { data: truncatedOutput, isTruncated, originalLength } = truncateOutput(output)

  return {
    key: AgentToolsType.WebSearch,
    label: (
      <ToolHeader
        toolName={AgentToolsType.WebSearch}
        params={input?.query}
        stats={output ? `${resultCount} 个结果` : undefined}
        variant="collapse-label"
        showStatus={false}
      />
    ),
    children: (
      <div>
        <div>{truncatedOutput}</div>
        {isTruncated && <TruncatedIndicator originalLength={originalLength} />}
      </div>
    )
  }
}
