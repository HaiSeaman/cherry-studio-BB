import type { CollapseProps } from 'antd'

import { countLines, truncateOutput } from '../shared/truncateOutput'
import { ClickableFilePath } from './ClickableFilePath'
import { ToolHeader, TruncatedIndicator } from './GenericTools'
import { TerminalContainer } from './TerminalOutput'
import {
  AgentToolsType,
  type GlobToolInput as GlobToolInputType,
  type GlobToolOutput as GlobToolOutputType
} from './types'

export function GlobTool({
  input,
  output
}: {
  input?: GlobToolInputType
  output?: GlobToolOutputType
}): NonNullable<CollapseProps['items']>[number] {
  const lineCount = output ? countLines(output) : 0
  const { data: truncatedOutput, isTruncated, originalLength } = truncateOutput(output)

  return {
    key: AgentToolsType.Glob,
    label: (
      <ToolHeader
        toolName={AgentToolsType.Glob}
        params={input?.pattern}
        stats={output ? `${lineCount} 个文件` : undefined}
        variant="collapse-label"
        showStatus={false}
      />
    ),
    children: (
      <div>
        <TerminalContainer>
          {truncatedOutput?.split('\n').map((line, i) =>
            line.startsWith('/') ? (
              <div key={i}>
                <ClickableFilePath path={line} />
              </div>
            ) : (
              <div key={i}>{line}</div>
            )
          )}
        </TerminalContainer>
        {isTruncated && <TruncatedIndicator originalLength={originalLength} />}
      </div>
    )
  }
}
