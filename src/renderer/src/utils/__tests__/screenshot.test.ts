import { describe, expect, it } from 'vitest'

import { DEFAULT_TARGET_LANGUAGE, getScreenshotActionPrompt, SCREENSHOT_OCR_PROMPT } from '../screenshot'

describe('getScreenshotActionPrompt', () => {
  it('returns the OCR prompt for ocr action', () => {
    expect(getScreenshotActionPrompt('ocr')).toBe(SCREENSHOT_OCR_PROMPT)
  })

  it('returns the OCR prompt for ocr action even with target language', () => {
    expect(getScreenshotActionPrompt('ocr', '英文')).toBe(SCREENSHOT_OCR_PROMPT)
  })

  it('returns translate prompt with the given target language', () => {
    expect(getScreenshotActionPrompt('translate', '英文')).toBe('请识别图片中的文字，并将其翻译为英文。')
  })

  it('falls back to the default target language when omitted', () => {
    expect(getScreenshotActionPrompt('translate')).toBe(`请识别图片中的文字，并将其翻译为${DEFAULT_TARGET_LANGUAGE}。`)
  })

  it('falls back to the default target language when blank', () => {
    expect(getScreenshotActionPrompt('translate', '  ')).toBe(
      `请识别图片中的文字，并将其翻译为${DEFAULT_TARGET_LANGUAGE}。`
    )
  })
})
