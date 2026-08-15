import type { NormalToolResponse } from '@renderer/types'
import { cn } from '@renderer/utils'
import { Tag } from 'antd'
import { Button } from 'antd'
import { CheckCircle2, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { SkeletonValue } from './MessageAgentTools/GenericTools'
import { type AskUserQuestionItem, parseAskUserQuestionToolInput } from './MessageAgentTools/types'

// ==================== Sub Components ====================

interface CardHeaderProps {
  currentIndex: number
  totalQuestions: number
  extra?: ReactNode
}

function CardHeader({ currentIndex, totalQuestions, extra }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-(--color-primary)" />
        <span className="font-semibold text-default-700">{'来自 Agent 的问题'}</span>
      </div>
      <span className="text-default-500 text-xs">
        <SkeletonValue value={totalQuestions > 0 ? `${currentIndex + 1} / ${totalQuestions}` : null} width="40px" />
        {extra}
      </span>
    </div>
  )
}

interface NavigationProps {
  showPrevious?: boolean
  isFirst: boolean
  isLast: boolean
  onPrevious: () => void
  onNext: () => void
}

function Navigation({ showPrevious = true, isFirst, isLast, onPrevious, onNext }: NavigationProps) {
  return (
    <div
      className={cn(
        'flex items-center border-default-200 border-t pt-3',
        showPrevious ? 'justify-between' : 'justify-end'
      )}>
      {showPrevious && (
        <Button icon={<ChevronLeft size={16} />} disabled={isFirst} onClick={onPrevious} className="flex items-center">
          {'上一个'}
        </Button>
      )}
      <Button
        disabled={isLast}
        onClick={onNext}
        className="flex items-center"
        iconPosition="end"
        icon={<ChevronRight size={16} />}>
        {'下一个'}
      </Button>
    </div>
  )
}

// ==================== Completed Mode Content ====================

interface CompletedContentProps {
  question: AskUserQuestionItem
  answer?: string
}

function CompletedContent({ question, answer }: CompletedContentProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Tag color={answer ? 'processing' : 'default'} className="m-0">
          <SkeletonValue value={question?.header} width="60px" />
        </Tag>
        {answer && <CheckCircle2 className="h-4 w-4 text-(--color-primary)" />}
      </div>
      <div className="text-default-700 text-sm">
        <SkeletonValue value={question?.question} width="100%" />
      </div>
      {answer && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-(--color-primary)" />
          <span className="text-(--color-primary) text-sm">{answer}</span>
        </div>
      )}
    </div>
  )
}

// ==================== Main Component ====================
export function AskUserQuestionCard({ toolResponse }: { toolResponse: NormalToolResponse }) {
  const { questions, answers } = useMemo(() => {
    const parsed = parseAskUserQuestionToolInput(toolResponse.arguments)
    return {
      questions: parsed?.questions ?? [],
      answers: parsed?.answers ?? {}
    }
  }, [toolResponse.arguments])

  const [currentIndex, setCurrentIndex] = useState(0)

  const displayAnswers = answers
  const currentQuestion = questions[currentIndex]
  const totalQuestions = questions.length
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === totalQuestions - 1

  if (!currentQuestion) {
    return null
  }

  const answeredCount = Object.keys(displayAnswers).length

  return (
    <div className="w-full max-w-xl rounded-xl border border-default-200 bg-default-100 px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3">
        <CardHeader
          currentIndex={currentIndex}
          totalQuestions={totalQuestions}
          extra={answeredCount > 0 ? ` · ${answeredCount} ${'已回答'}` : undefined}
        />

        <CompletedContent question={currentQuestion} answer={displayAnswers[currentQuestion.question]} />

        {totalQuestions > 1 && (
          <Navigation
            showPrevious={totalQuestions > 1}
            isFirst={isFirstQuestion}
            isLast={isLastQuestion}
            onPrevious={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            onNext={() => setCurrentIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
          />
        )}
      </div>
    </div>
  )
}

export default AskUserQuestionCard
