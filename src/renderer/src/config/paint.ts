/**
 * 图片生成（绘画）TAB 配置
 */

/** 生成尺寸选项（label 展示给用户，value 传给 AI SDK） */
export const PAINT_IMAGE_SIZES = [
  { label: '1:1', value: '1024x1024' },
  { label: '16:9', value: '1344x768' },
  { label: '9:16', value: '768x1344' }
] as const

/**
 * 像素尺寸分组预设（非 Gemini 模型）
 * 按比例分组，覆盖常见绘画模型支持的尺寸档位
 */
export const PAINT_PIXEL_SIZE_GROUPS = [
  {
    label: '正方形',
    options: [
      { label: '512x512', value: '512x512' },
      { label: '768x768', value: '768x768' },
      { label: '1024x1024', value: '1024x1024' },
      { label: '1536x1536', value: '1536x1536' },
      { label: '2048x2048', value: '2048x2048' }
    ]
  },
  {
    label: '横版',
    options: [
      { label: '1344x768 (16:9)', value: '1344x768' },
      { label: '1536x1024 (3:2)', value: '1536x1024' },
      { label: '1792x1024 (7:4)', value: '1792x1024' },
      { label: '2048x1152 (16:9)', value: '2048x1152' }
    ]
  },
  {
    label: '竖版',
    options: [
      { label: '768x1344 (9:16)', value: '768x1344' },
      { label: '1024x1536 (2:3)', value: '1024x1536' },
      { label: '1024x1792 (4:7)', value: '1024x1792' },
      { label: '1152x2048 (9:16)', value: '1152x2048' }
    ]
  }
] as const

export type PaintImageSize = (typeof PAINT_IMAGE_SIZES)[number]['value']

/** 单次生成数量选项 */
export const PAINT_BATCH_OPTIONS = [1, 2, 4] as const

/**
 * Gemini 图像模型（Nano Banana 系列）官方宽高比
 * 来源：Gemini 3.1 Flash Image 官方文档（GenerateContentConfig.imageConfig.aspectRatio）
 */
export const GEMINI_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
  '1:4',
  '4:1',
  '1:8',
  '8:1',
  '9:21'
] as const

/**
 * Gemini 图像模型官方分辨率（必须大写 K，小写会被 API 拒绝）
 * 512(0.5K) 仅 Gemini 3.1 Flash Image 支持；默认 1K
 */
export const GEMINI_IMAGE_SIZES = ['1K', '2K', '4K', '512'] as const

/** Gemini 人物生成模式（官方枚举：ALLOW_ALL / ALLOW_ADULT / ALLOW_NONE） */
export const GEMINI_PERSON_GENERATION = [
  { label: '允许所有人', value: 'ALLOW_ALL' },
  { label: '仅允许成人', value: 'ALLOW_ADULT' },
  { label: '禁止人物', value: 'ALLOW_NONE' }
] as const

/** 一键优化提示词的模型提示词模板 */
export const PAINT_ENHANCE_PROMPT = `你是一位专业的 AI 绘画提示词优化专家。请将用户输入的描述扩写为一段详细、高质量、可直接用于 AI 绘画模型的提示词。要求：保留核心内容，补充风格、光线、构图、细节描述；用户输入为中文时翻译为英文输出；长度 50-200 词。只输出优化后的提示词，不要任何解释。`
