/**
 * 天气数据转换工具（纯函数，无网络、无 React）
 *
 * Open-Meteo 返回的是 WMO 天气码（数字）和 ISO 时间字符串，
 * 界面上要显示的是中文和图标，所以统一在这一层翻译。
 * 所有函数都做了缺失/异常兜底，接口返回怪数据时界面不会崩。
 */

/** 图标分类：WeatherWindow 按这个字段选 lucide 图标 */
export type WeatherIconKey = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder'

/** WMO 天气码 → 中文名（对照 Open-Meteo 官方文档的 weather code 表） */
const WEATHER_CODE_TEXT: Record<number, string> = {
  0: '晴',
  1: '大部晴朗',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '强阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴小冰雹',
  99: '雷阵雨伴大冰雹'
}

/** 未知天气码统一显示这个，避免出现「undefined」 */
export const UNKNOWN_WEATHER_TEXT = '未知天气'

/** 天气码 → 中文名 */
export function getWeatherText(code: number | undefined | null): string {
  if (typeof code !== 'number' || !Number.isFinite(code)) return UNKNOWN_WEATHER_TEXT
  return WEATHER_CODE_TEXT[code] ?? UNKNOWN_WEATHER_TEXT
}

/** 天气码 → 图标分类 */
export function getWeatherIconKey(code: number | undefined | null): WeatherIconKey {
  if (typeof code !== 'number' || !Number.isFinite(code)) return 'cloudy'
  if (code === 0) return 'clear'
  if (code === 1 || code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ((code >= 51 && code <= 57) || code === 80) return 'drizzle'
  if ((code >= 61 && code <= 67) || code === 81 || code === 82) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'cloudy'
}

/** 空气质量的等级（按中国常用的 AQI 分段） */
export type AqiLevel = {
  /** 优 / 良 / 轻度污染 … */
  text: string
  /** 显示颜色（跟随主题亮暗都能看清） */
  color: string
}

const AQI_LEVELS: Array<{ max: number } & AqiLevel> = [
  { max: 50, text: '优', color: '#00b050' },
  { max: 100, text: '良', color: '#e6b800' },
  { max: 150, text: '轻度污染', color: '#ff8c00' },
  { max: 200, text: '中度污染', color: '#e02020' },
  { max: 300, text: '重度污染', color: '#8b1a8b' },
  { max: Number.POSITIVE_INFINITY, text: '严重污染', color: '#7a1010' }
]

/**
 * AQI 数值 → 等级。
 * 注意：这里用的是 Open-Meteo 的 us_aqi（美国标准 AQI，0~500），
 * 它和中国 AQI 的分段略有差异，但对日常「优/良/污染」的判断足够用。
 */
export function getAqiLevel(aqi: number | undefined | null): AqiLevel | null {
  if (typeof aqi !== 'number' || !Number.isFinite(aqi) || aqi < 0) return null
  const matched = AQI_LEVELS.find((level) => aqi <= level.max)!
  return { text: matched.text, color: matched.color }
}

/** 把 ISO 时间字符串（如 "2026-10-18T13:45"）切成 "13:45"，解析失败返回空串 */
export function formatClock(iso: string | undefined | null): string {
  if (typeof iso !== 'string') return ''
  const match = /T(\d{2}):(\d{2})/.exec(iso)
  return match ? `${match[1]}:${match[2]}` : ''
}

/** 把日期字符串（如 "2026-10-18"）切成 "周一"，解析失败返回原串 */
export function formatWeekday(dateStr: string | undefined | null): string {
  if (typeof dateStr !== 'string') return ''
  // 用 UTC 解析再取 UTC 星期，避免时区把日期挪一天
  const parsed = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return dateStr
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parsed.getUTCDay()]
}

/**
 * 5 天预报的日期标签：与今天同一天的那一项显示「今天」，其余显示「周X」。
 * 不能无条件把第一项标成「今天」——接口结果有 30 分钟缓存，
 * 跨过午夜后第一项其实是「昨天」。
 */
export function getDayLabels(dates: string[], today = localDateString()): string[] {
  return dates.map((date) => (date === today ? '今天' : formatWeekday(date)))
}

/** 本地日期字符串 YYYY-MM-DD（不能用 toISOString，那是 UTC，晚上 8 点后会差一天） */
export function localDateString(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * 在 5 天预报里找「今天」那一项的下标；找不到返回 -1。
 * 顶部卡片和列表必须用同一天，否则跨午夜缓存会出现「卡片是昨天、列表标今天」。
 */
export function findTodayIndex(dates: string[], today = localDateString()): number {
  return dates.indexOf(today)
}

/** 经纬度 → 坐标文本，用于反向地名失败时兜底显示 */
export function formatCoordinates(lat: number | undefined | null, lon: number | undefined | null): string {
  const valid = (v: number | undefined | null): v is number => typeof v === 'number' && Number.isFinite(v)
  if (!valid(lat) || !valid(lon)) return ''
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`
}

/** 风向角度 → 八方位中文，如 90° → 东；无效值返回空串 */
export function getWindDirection(deg: number | undefined | null): string {
  if (typeof deg !== 'number' || !Number.isFinite(deg)) return ''
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  // 先归一化到 0~359，再按 45° 一档取最近的方位
  const normalized = ((deg % 360) + 360) % 360
  return directions[Math.round(normalized / 45) % 8]
}

/** 紫外线强度分级（WHO 标准） */
export function getUvLevel(uv: number | undefined | null): AqiLevel | null {
  if (typeof uv !== 'number' || !Number.isFinite(uv) || uv < 0) return null
  if (uv < 3) return { text: '低', color: '#00b050' }
  if (uv < 6) return { text: '中等', color: '#e6b800' }
  if (uv < 8) return { text: '高', color: '#ff8c00' }
  if (uv < 11) return { text: '很高', color: '#e02020' }
  return { text: '极高', color: '#8b1a8b' }
}
