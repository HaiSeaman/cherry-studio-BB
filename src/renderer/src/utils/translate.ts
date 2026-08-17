import { loggerService } from '@logger'
import { isQwenMTModel } from '@renderer/config/models'
import { LANG_DETECT_PROMPT } from '@renderer/config/prompts'
import { builtinLanguages, LanguagesEnum, UNKNOWN } from '@renderer/config/translate'
import db from '@renderer/databases'
import { fetchChatCompletion } from '@renderer/services/ApiService'
import { getDefaultAssistant, getQuickModel } from '@renderer/services/AssistantService'
import { hasModel } from '@renderer/services/ModelService'
import { estimateTextTokens } from '@renderer/services/TokenService'
import type { Assistant, TranslateLanguage, TranslateLanguageCode } from '@renderer/types'
import type { Chunk } from '@renderer/types/chunk'
import { ChunkType } from '@renderer/types/chunk'
import { franc } from 'franc-min'
import { sliceByTokens } from 'tokenx'

const logger = loggerService.withContext('Utils:translate')

/**
 * 检测输入文本的语言
 * @param inputText 需要检测语言的文本
 * @returns 检测到的语言
 * @throws {Error}
 */
export const detectLanguage = async (inputText: string): Promise<TranslateLanguageCode> => {
  const text = inputText.trim()
  if (!text) return LanguagesEnum.zhCN.langCode

  let method = (await db.settings.get({ id: 'translate:detect:method' }))?.value
  if (!method) method = 'auto'
  logger.info(`auto detection method: ${method}`)

  let result: TranslateLanguageCode
  switch (method) {
    case 'auto':
      // hard encoded threshold
      if (estimateTextTokens(text) < 100) {
        result = await detectLanguageByLLM(text)
      } else {
        result = detectLanguageByFranc(text)
        // fallback to llm when franc fails
        if (result === UNKNOWN.langCode) {
          result = await detectLanguageByLLM(text)
        }
      }
      break
    case 'franc':
      result = detectLanguageByFranc(text)
      break
    case 'llm':
      result = await detectLanguageByLLM(text)
      break
    default:
      throw new Error('Invalid detection method.')
  }
  logger.info(`Detected Language: ${result}`)
  return result.trim()
}

const detectLanguageByLLM = async (inputText: string): Promise<TranslateLanguageCode> => {
  logger.info('Detect language by llm')
  let detectedLang = ''
  const text = sliceByTokens(inputText, 0, 100)

  const translateLanguageOptions = await getTranslateOptions()
  const listLang = translateLanguageOptions.map((item) => item.langCode)
  const listLangText = JSON.stringify(listLang)

  const model = getQuickModel()
  if (!model || !hasModel(model)) {
    throw new Error('模型不存在')
  }

  if (isQwenMTModel(model)) {
    logger.info('QwenMT cannot be used for language detection.')
    if (isQwenMTModel(model)) {
      throw new Error('QwenMT模型不能用于语言检测')
    }
  }

  const assistant: Assistant = getDefaultAssistant()

  assistant.model = model
  assistant.settings = {
    reasoning_effort: 'none'
  }
  assistant.prompt = LANG_DETECT_PROMPT.replace('{{list_lang}}', listLangText).replace('{{input}}', text)

  const onChunk: (chunk: Chunk) => void = (chunk: Chunk) => {
    // 你的意思是，虽然写的是delta类型，但其实是完整拼接后的结果？
    if (chunk.type === ChunkType.TEXT_DELTA) {
      detectedLang = chunk.text
    }
  }

  await fetchChatCompletion({ prompt: 'follow system prompt', assistant, onChunkReceived: onChunk })
  return detectedLang.trim()
}

const detectLanguageByFranc = (inputText: string): TranslateLanguageCode => {
  logger.info('Detect language by franc')
  const iso3 = franc(inputText)

  const isoMap: Record<string, TranslateLanguage> = {
    cmn: LanguagesEnum.zhCN,
    jpn: LanguagesEnum.jaJP,
    kor: LanguagesEnum.koKR,
    rus: LanguagesEnum.ruRU,
    ara: LanguagesEnum.arAR,
    spa: LanguagesEnum.esES,
    fra: LanguagesEnum.frFR,
    deu: LanguagesEnum.deDE,
    ita: LanguagesEnum.itIT,
    por: LanguagesEnum.ptPT,
    eng: LanguagesEnum.enUS,
    pol: LanguagesEnum.plPL,
    tur: LanguagesEnum.trTR,
    tha: LanguagesEnum.thTH,
    vie: LanguagesEnum.viVN,
    ind: LanguagesEnum.idID,
    urd: LanguagesEnum.urPK,
    zsm: LanguagesEnum.msMY
  }

  return isoMap[iso3]?.langCode ?? UNKNOWN.langCode
}

/**
 * 获取所有可用的翻译语言选项。
 * @returns 返回内置语言选项
 */
export const getTranslateOptions = async () => {
  return builtinLanguages
}
