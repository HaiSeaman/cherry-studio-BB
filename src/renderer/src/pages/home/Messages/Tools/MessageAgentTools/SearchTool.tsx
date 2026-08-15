import type { CollapseProps } from 'antd'

import { countLines, truncateOutput } from '../shared/truncateOutput'
import { StringInputTool, StringOutputTool, ToolHeader, TruncatedIndicator } from './GenericTools'
import {
  AgentToolsType,
  type SearchToolInput as SearchToolInputType,
  type SearchToolOutput as SearchToolOutputType
} from './types'

export function SearchTool({
  input,
  output
}: {
  input?: SearchToolInputType
  output?: SearchToolOutputType
}): NonNullable<CollapseProps['items']>[number] {
  const resultCount = output ? countLines(output) : 0
  const { data: truncatedOutput, isTruncated, originalLength } = truncateOutput(output)

  return {
    key: AgentToolsType.Search,
    label: (
      <ToolHeader
        toolName={AgentToolsType.Search}
        params={input ? `"${input}"` : undefined}
        stats={output ? `${resultCount} 个结果` : undefined}
        variant="collapse-label"
        showStatus={false}
      />
    ),
    children: (
      <div>
        {input && <StringInputTool input={input} label={'搜索查询'} />}
        {truncatedOutput && (
          <div>
            <StringOutputTool
              output={truncatedOutput}
              label={'搜索结果'}
              textColor="text-yellow-600 dark:text-yellow-400"
            />
            {isTruncated && <TruncatedIndicator originalLength={originalLength} />}
          </div>
        )}
      </div>
    )
  }
}
