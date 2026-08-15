import PrivacyPopup from '@renderer/components/Popups/PrivacyPopup'
import WindowControls from '@renderer/components/WindowControls'
import { Checkbox } from 'antd'
import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'

import SelectModelPage from './components/SelectModelPage'
import SkipButton from './components/SkipButton'
import WelcomePage from './components/WelcomePage'

export type OnboardingStep = 'welcome' | 'select-model'

interface OnboardingPageProps {
  onComplete: () => void
}

const OnboardingPage: FC<OnboardingPageProps> = ({ onComplete }) => {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [privacyAccepted, setPrivacyAccepted] = useState(true)

  const updateDataCollection = useCallback((enabled: boolean) => {
    setPrivacyAccepted(enabled)
  }, [])

  const handleShowPrivacy = useCallback(async () => {
    const result = await PrivacyPopup.show({
      acceptButtonText: '同意并继续',
      force: true,
      quitOnDecline: false
    })

    if (result?.accepted === true) {
      updateDataCollection(true)
    }

    if (result?.accepted === false) {
      updateDataCollection(false)
    }
  }, [updateDataCollection])

  useEffect(() => {
    updateDataCollection(true)
  }, [updateDataCollection])

  return (
    <div className="flex h-screen w-screen flex-col">
      <div className="drag flex w-full shrink-0 items-center justify-end" style={{ height: 'var(--navbar-height)' }}>
        <WindowControls />
      </div>
      <div className="flex flex-1 px-2 pb-2">
        <div className="relative flex flex-1 overflow-hidden rounded-xl bg-(--color-background)">
          <SkipButton onSkip={onComplete} />
          {step === 'welcome' && <WelcomePage setStep={setStep} />}
          {step === 'select-model' && <SelectModelPage setStep={setStep} onComplete={onComplete} />}
          <div className="absolute bottom-5 left-0 z-10 flex w-full justify-center px-8 text-center">
            <Checkbox
              checked={privacyAccepted}
              className="max-w-5xl text-center"
              onChange={(event) => updateDataCollection(event.target.checked)}>
              <span className="text-(--color-text-3) text-xs leading-relaxed">
                {'继续即表示你已阅读并同意'}
                <button
                  type="button"
                  className="ml-1 cursor-pointer border-none bg-transparent p-0 text-(--color-primary) text-xs hover:underline"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void handleShowPrivacy()
                  }}>
                  {'隐私政策'}
                </button>
                {'。'}
              </span>
            </Checkbox>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OnboardingPage
