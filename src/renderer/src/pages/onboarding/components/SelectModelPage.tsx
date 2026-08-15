import ModelSettings from '@renderer/pages/settings/ModelSettings/ModelSettings'
import { Button } from 'antd'
import { ArrowLeft } from 'lucide-react'
import type { FC } from 'react'

import type { OnboardingStep } from '../OnboardingPage'

interface SelectModelPageProps {
  setStep: (step: OnboardingStep) => void
  onComplete: () => void
}

const SelectModelPage: FC<SelectModelPageProps> = ({ setStep, onComplete }) => {
  const handleBack = () => {
    setStep('welcome')
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      <Button
        type="text"
        icon={<ArrowLeft size={18} />}
        className="text-(--color-text-3) opacity-50 hover:opacity-80"
        style={{ position: 'absolute', top: 16, left: 16 }}
        onClick={handleBack}
      />
      <div className="flex w-96 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-semibold text-(--color-text) text-2xl">{'选择你的默认模型'}</h1>
          <p className="m-0 text-(--color-text-2) text-sm">{'为每个场景选择默认模型'}</p>
        </div>

        <ModelSettings showSettingsButton={false} showDescription={false} compact />

        <Button type="primary" size="large" block className="h-12 rounded-lg" onClick={onComplete}>
          {'开始使用'}
        </Button>

        <p className="m-0 text-center text-(--color-text-3) text-xs">{'您可以随时在设置中更改'}</p>
      </div>
    </div>
  )
}

export default SelectModelPage
