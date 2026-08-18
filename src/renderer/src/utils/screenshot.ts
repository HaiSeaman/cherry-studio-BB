export type ScreenshotAction = 'ocr' | 'translate'

export const SCREENSHOT_OCR_PROMPT = '请识别图片中的所有文字，并原样输出。'

export const DEFAULT_TARGET_LANGUAGE = '简体中文'

/**
 * 生成截图快捷动作（识别文字 / 翻译图片）的发送指令。
 * @param action - 动作类型
 * @param targetLanguage - 翻译目标语言（中文名），仅 translate 使用；缺省用默认值
 */
export function getScreenshotActionPrompt(action: ScreenshotAction, targetLanguage?: string): string {
  if (action === 'translate') {
    const lang = targetLanguage?.trim() || DEFAULT_TARGET_LANGUAGE
    return `请识别图片中的文字，并将其翻译为${lang}。`
  }
  return SCREENSHOT_OCR_PROMPT
}
