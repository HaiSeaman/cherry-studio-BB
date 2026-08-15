import type { CollapseProps } from 'antd'
import ReactMarkdown from 'react-markdown'

import { truncateOutput } from '../shared/truncateOutput'
import { ToolHeader, TruncatedIndicator } from './GenericTools'
import type { ExitPlanModeToolInput, ExitPlanModeToolOutput } from './types'
import { AgentToolsType } from './types'

export function ExitPlanModeTool({
  input,
  output
}: {
  input?: ExitPlanModeToolInput
  output?: ExitPlanModeToolOutput
}): NonNullable<CollapseProps['items']>[number] {
  const plan = input?.plan ?? ''
  const planCount = plan ? plan.split('\n\n').length : 0
  const combinedContent = plan + '\n\n' + (output ?? '')
  const { data: truncatedContent, isTruncated, originalLength } = truncateOutput(combinedContent)

  return {
    key: AgentToolsType.ExitPlanMode,
    label: (
      <ToolHeader
        toolName={AgentToolsType.ExitPlanMode}
        stats={`${planCount} 个计划`}
        variant="collapse-label"
        showStatus={false}
      />
    ),
    children: (
      <div>
        <ReactMarkdown>{truncatedContent}</ReactMarkdown>
        {isTruncated && <TruncatedIndicator originalLength={originalLength} />}
      </div>
    )
  }
}
