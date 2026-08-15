import type { CollapseProps } from 'antd'

import { countLines, truncateOutput } from '../shared/truncateOutput'
import { ClickableFilePath } from './ClickableFilePath'
import { ToolHeader, TruncatedIndicator } from './GenericTools'
import { TerminalContainer } from './TerminalOutput'
import { AgentToolsType, type GrepToolInput, type GrepToolOutput } from './types'

const FILE_PATH_RE = /^(\/[\w./@+-][^:]*[^:])(:.*)?$/

export function GrepTool({
  input,
  output
}: {
  input?: GrepToolInput
  output?: GrepToolOutput
}): NonNullable<CollapseProps['items']>[number] {
  const resultLines = output ? countLines(output) : 0
  const { data: truncatedOutput, isTruncated, originalLength } = truncateOutput(output)

  return {
    key: AgentToolsType.Grep,
    label: (
      <ToolHeader
        toolName={AgentToolsType.Grep}
        params={
          <>
            {input?.pattern}
            {input?.output_mode && <span className="ml-1">({input.output_mode})</span>}
          </>
        }
        stats={output ? `${resultLines} 行` : undefined}
        variant="collapse-label"
        showStatus={false}
      />
    ),
    children: (
      <div>
        <TerminalContainer>
          {truncatedOutput?.split('\n').map((line, i) => {
            const match = line.match(FILE_PATH_RE)
            if (match) {
              return (
                <div key={i}>
                  <ClickableFilePath path={match[1]} />
                  {match[2] ?? ''}
                </div>
              )
            }
            return <div key={i}>{line}</div>
          })}
        </TerminalContainer>
        {isTruncated && <TruncatedIndicator originalLength={originalLength} />}
      </div>
    )
  }
}
