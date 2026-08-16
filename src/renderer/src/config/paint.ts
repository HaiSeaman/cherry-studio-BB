/**
 * 图片生成（绘画）TAB 配置
 *
 * 尺寸采用统一的「宽高比 + 分辨率档位」表达（对所有模型家族一致）：
 * - Gemini：比例与档位（1K/2K/4K/512）直接透传官方 imageConfig 参数
 * - 阿里云百炼（qwen-image-2.0/3.0 等）：按比例×档位映射为合法像素（宽x高），
 *   超出模型上限时自动夹紧；档位选「自动」则不传 size，由模型自行推荐
 * - 其他 OpenAI 兼容模型：像素直接传给 /images/generations
 */

/** 统一宽高比选项（Gemini 与百炼均可承接，比例范围均在各家 1:8~8:1 限制内） */
export const PAINT_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const

/**
 * 统一分辨率档位（label 展示给用户，value 参与映射）
 * auto：不指定尺寸，由模型按提示词自动推荐
 */
export const PAINT_RESOLUTION_TIERS = [
  { label: '自动', value: 'auto' },
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
  { label: '512', value: '512' }
] as const

/** 各档位对应的等效正方形边长（面积 = 边长²） */
const TIER_EDGE_PIXELS: Record<string, number> = { '1K': 1024, '2K': 2048, '4K': 4096, '512': 512 }

/**
 * 像素夹紧范围（按百炼 qwen-image-2.0/3.0 的限制取交集：
 * 单边 [512, 2048]；其他模型由各自适配层兜底）
 */
const MIN_SIDE = 512
const MAX_SIDE = 2048

/**
 * 将「宽高比 × 分辨率档位」映射为模型可用的像素尺寸字符串（'宽x高'）：
 * 1. 按档位面积与比例计算理想像素
 * 2. 长边超过 2048 时等比缩小；短边低于 512 时等比放大（保持比例）
 * 档位为 auto 或比例非法时返回 undefined（调用方不传 size）
 */
export function resolvePaintPixelSize(ratio: string, tier: string): string | undefined {
  if (tier === 'auto') {
    return undefined
  }
  const edge = TIER_EDGE_PIXELS[tier]
  const match = /^(\d+):(\d+)$/.exec(ratio?.trim() ?? '')
  if (!edge || !match) {
    return undefined
  }
  const rw = Number(match[1])
  const rh = Number(match[2])
  if (rw <= 0 || rh <= 0) {
    return undefined
  }

  // 理想像素：保持档位总面积，按比例分配宽高
  let width = Math.round(Math.sqrt((edge * edge * rw) / rh))
  let height = Math.round(Math.sqrt((edge * edge * rh) / rw))

  // 先夹长边上限，再抬短边下限；抬升仅在不会把长边再次推过上限时进行。
  // 极端自定义比例（如 8:1）两者不可兼得时保持比例、允许短边低于 512，
  // 由服务端校验兜底（DashScope 适配层会在 size 报错时自动去掉 size 重试）
  const maxSide = Math.max(width, height)
  if (maxSide > MAX_SIDE) {
    const scale = MAX_SIDE / maxSide
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const minSide = Math.min(width, height)
  if (minSide < MIN_SIDE) {
    const scale = MIN_SIDE / minSide
    const scaledWidth = Math.round(width * scale)
    const scaledHeight = Math.round(height * scale)
    if (Math.max(scaledWidth, scaledHeight) <= MAX_SIDE) {
      width = scaledWidth
      height = scaledHeight
    }
  }

  return `${width}x${height}`
}

/** 单次生成数量选项 */
export const PAINT_BATCH_OPTIONS = [1, 2, 4] as const

/** Gemini 人物生成模式（官方枚举：ALLOW_ALL / ALLOW_ADULT / ALLOW_NONE） */
export const GEMINI_PERSON_GENERATION = [
  { label: '允许所有人', value: 'ALLOW_ALL' },
  { label: '仅允许成人', value: 'ALLOW_ADULT' },
  { label: '禁止人物', value: 'ALLOW_NONE' }
] as const

/** 一键优化提示词的模型提示词模板 */
export const PAINT_ENHANCE_PROMPT = `你是一位专业的 AI 绘画提示词优化专家。请将用户输入的描述扩写为一段详细、高质量、可直接用于 AI 绘画模型的提示词。要求：保留核心内容，补充风格、光线、构图、细节描述；用户输入为中文时翻译为英文输出；长度 50-200 词。只输出优化后的提示词，不要任何解释。`
