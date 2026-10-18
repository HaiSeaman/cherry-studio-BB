/**
 * 天气数据接口封装
 *
 * 全部使用免费、无需注册的公开接口：
 * - 天气/预报：Open-Meteo
 * - 空气质量：Open-Meteo Air Quality
 * - 城市搜索：Open-Meteo Geocoding（支持中文）
 * - IP 定位：ipwho.is
 * - 坐标转中文地名：BigDataCloud
 *
 * 设计原则：
 * 1. 网络逻辑与界面分离，本文件不依赖 React；
 * 2. 每个请求 8 秒超时，避免小窗口一直转圈；
 * 3. 接口返回的数据一律经过 normalize 函数，字段缺失时返回 null 而不是崩溃。
 */

import { type AqiLevel, formatClock, getAqiLevel } from './weatherCodes'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const IP_LOCATE_URL = 'https://ipwho.is/'
const REVERSE_GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client'

const REQUEST_TIMEOUT_MS = 8000
/** 天气数据缓存 30 分钟：同一城市反复切换 tab 时不再发请求（窗口关闭后缓存随进程销毁） */
const CACHE_TTL_MS = 30 * 60 * 1000
/** 保存在主进程配置里的「上次城市」。扁平键名，避免 electron-store 把点号当嵌套路径 */
const SAVED_LOCATION_KEY = 'musicWidgetWeatherLocation'

/** 一个具体地点（城市级） */
export type WeatherLocation = {
  name: string
  /** 省 / 州，可能没有 */
  region?: string
  /** 国家，可能没有 */
  country?: string
  latitude: number
  longitude: number
}

export type CurrentWeather = {
  time: string
  temperature: number | null
  apparentTemperature: number | null
  humidity: number | null
  precipitation: number | null
  weatherCode: number | null
  isDay: boolean
  windSpeed: number | null
  windDirection: number | null
  windGust: number | null
  cloudCover: number | null
  pressure: number | null
}

export type DailyForecast = {
  date: string
  weatherCode: number | null
  tempMax: number | null
  tempMin: number | null
  apparentMax: number | null
  apparentMin: number | null
  sunrise: string
  sunset: string
  uvIndexMax: number | null
  precipitationSum: number | null
  precipitationProbability: number | null
  windSpeedMax: number | null
}

export type WeatherBundle = {
  location: WeatherLocation
  current: CurrentWeather
  daily: DailyForecast[]
}

export type AirQualityData = {
  pm25: number | null
  pm10: number | null
  aqi: number | null
  level: AqiLevel | null
}

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 带超时的 JSON 请求；超时与 HTTP 错误都转成中文提示 */
async function fetchJson<T>(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`服务器返回错误（HTTP ${response.status}）`)
    }
    // 代理/门户劫持时可能返回 HTML，json() 会抛英文 SyntaxError，这里转成中文提示
    try {
      return (await response.json()) as T
    } catch {
      throw new Error('天气服务返回了无法识别的数据，请稍后重试')
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络后重试')
    }
    throw error instanceof Error ? error : new Error('网络请求失败')
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// 数据归一化（纯函数，可单元测试）
// ---------------------------------------------------------------------------

type RawRecord = Record<string, unknown>

function asRecord(value: unknown): RawRecord {
  return value !== null && typeof value === 'object' ? (value as RawRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 接口返回的原始天气 JSON → 内部结构；结构不对时抛错，由界面显示重试 */
export function normalizeForecast(raw: unknown): Pick<WeatherBundle, 'current' | 'daily'> {
  const data = asRecord(raw)
  const current = asRecord(data.current)
  const daily = asRecord(data.daily)
  const dates = asArray(daily.time)

  if (Object.keys(current).length === 0 && dates.length === 0) {
    throw new Error('天气数据格式异常')
  }

  const currentWeather: CurrentWeather = {
    time: text(current.time),
    temperature: num(current.temperature_2m),
    apparentTemperature: num(current.apparent_temperature),
    humidity: num(current.relative_humidity_2m),
    precipitation: num(current.precipitation),
    weatherCode: num(current.weather_code),
    // 接口用 0/1 表示昼夜
    isDay: num(current.is_day) !== 0,
    windSpeed: num(current.wind_speed_10m),
    windDirection: num(current.wind_direction_10m),
    windGust: num(current.wind_gusts_10m),
    cloudCover: num(current.cloud_cover),
    pressure: num(current.pressure_msl)
  }

  const at = (key: string, index: number): unknown => {
    const list = asArray(daily[key])
    return index < list.length ? list[index] : undefined
  }

  const forecasts: DailyForecast[] = dates.map((value, index) => ({
    date: text(value),
    weatherCode: num(at('weather_code', index)),
    tempMax: num(at('temperature_2m_max', index)),
    tempMin: num(at('temperature_2m_min', index)),
    apparentMax: num(at('apparent_temperature_max', index)),
    apparentMin: num(at('apparent_temperature_min', index)),
    sunrise: formatClock(text(at('sunrise', index))),
    sunset: formatClock(text(at('sunset', index))),
    uvIndexMax: num(at('uv_index_max', index)),
    precipitationSum: num(at('precipitation_sum', index)),
    precipitationProbability: num(at('precipitation_probability_max', index)),
    windSpeedMax: num(at('wind_speed_10m_max', index))
  }))

  return { current: currentWeather, daily: forecasts }
}

/** 空气质量 JSON → 内部结构；拿不到任何数值时返回 null（界面隐藏该行） */
export function normalizeAirQuality(raw: unknown): AirQualityData | null {
  const current = asRecord(asRecord(raw).current)
  const pm25 = num(current.pm2_5)
  const pm10 = num(current.pm10)
  const aqi = num(current.us_aqi)

  if (pm25 === null && pm10 === null && aqi === null) return null
  return { pm25, pm10, aqi, level: getAqiLevel(aqi) }
}

/** 城市搜索结果 → 统一结构；缺少坐标的条目直接丢弃 */
export function normalizeCityResults(raw: unknown): WeatherLocation[] {
  const results = asArray(asRecord(raw).results)
  const cities: WeatherLocation[] = []

  for (const item of results) {
    const record = asRecord(item)
    const name = text(record.name)
    const latitude = num(record.latitude)
    const longitude = num(record.longitude)
    if (!name || latitude === null || longitude === null) continue

    cities.push({
      name,
      region: text(record.admin1) || undefined,
      country: text(record.country) || undefined,
      latitude,
      longitude
    })
  }

  return cities
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

const weatherCache = new Map<string, { at: number; data: WeatherBundle }>()

function cacheKey(location: WeatherLocation): string {
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`
}

/** 拉取天气（当前 + 5 天）；默认 30 分钟内走缓存，force=true 强制刷新 */
export async function loadWeather(
  location: WeatherLocation,
  options: { force?: boolean } = {}
): Promise<WeatherBundle> {
  const key = cacheKey(location)
  const hit = weatherCache.get(key)
  if (!options.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data
  }

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'auto',
    forecast_days: '5',
    wind_speed_unit: 'ms',
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'cloud_cover',
      'pressure_msl'
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'sunrise',
      'sunset',
      'uv_index_max',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max'
    ].join(',')
  })

  const raw = await fetchJson(`${FORECAST_URL}?${params.toString()}`)
  const normalized = normalizeForecast(raw)
  const data: WeatherBundle = { location, ...normalized }
  weatherCache.set(key, { at: Date.now(), data })
  return data
}

/** 拉取空气质量；失败由调用方决定是否隐藏（不影响主天气显示） */
export async function loadAirQuality(location: WeatherLocation): Promise<AirQualityData | null> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'auto',
    current: 'pm2_5,pm10,us_aqi'
  })
  const raw = await fetchJson(`${AIR_QUALITY_URL}?${params.toString()}`)
  return normalizeAirQuality(raw)
}

/** 按城市名搜索（支持中文与英文，英文会返回对应中文名） */
export async function searchCities(query: string): Promise<WeatherLocation[]> {
  const name = query.trim()
  if (!name) return []

  const params = new URLSearchParams({
    name,
    count: '8',
    language: 'zh',
    format: 'json'
  })
  const raw = await fetchJson(`${GEOCODING_URL}?${params.toString()}`)
  return normalizeCityResults(raw)
}

/** 坐标 → 中文地名；失败返回 null（界面退回显示经纬度） */
export async function reverseGeocode(latitude: number, longitude: number): Promise<WeatherLocation | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: 'zh'
  })
  const raw = await fetchJson(`${REVERSE_GEOCODE_URL}?${params.toString()}`, 12000)
  const data = asRecord(raw)
  // city 是城市名，locality 是区县；city 为空时退回区县
  const name = text(data.city) || text(data.locality)
  if (!name) return null

  return {
    name,
    region: text(data.principalSubdivision) || undefined,
    country: text(data.countryName) || undefined,
    latitude,
    longitude
  }
}

/**
 * IP 粗定位（只能到城市级）。
 * ipwho.is 对国内城市常返回拼音（如 Nanning），所以再用坐标反查一次中文名；
 * 反查失败就直接用 IP 结果，不影响主流程。
 */
export async function locateByIp(): Promise<WeatherLocation> {
  const raw = await fetchJson(`${IP_LOCATE_URL}?lang=zh`)
  const data = asRecord(raw)

  if (data.success === false) {
    throw new Error(text(data.message) || 'IP 定位失败')
  }

  const latitude = num(data.latitude)
  const longitude = num(data.longitude)
  if (latitude === null || longitude === null) {
    throw new Error('IP 定位失败')
  }

  const fallbackName = text(data.city) || text(data.region) || text(data.country)
  const local = await reverseGeocode(latitude, longitude).catch(() => null)

  return {
    name: local?.name || fallbackName || '当前位置',
    region: local?.region || text(data.region) || undefined,
    country: local?.country || text(data.country) || undefined,
    latitude,
    longitude
  }
}

// ---------------------------------------------------------------------------
// 记住上次城市（存放在主进程配置里，重启后仍然有效）
// ---------------------------------------------------------------------------

function isValidLocation(value: unknown): value is WeatherLocation {
  const record = asRecord(value)
  return text(record.name).length > 0 && num(record.latitude) !== null && num(record.longitude) !== null
}

export async function loadSavedLocation(): Promise<WeatherLocation | null> {
  try {
    const saved = await window.api?.config?.get(SAVED_LOCATION_KEY)
    if (!isValidLocation(saved)) return null
    return {
      name: saved.name,
      region: text(saved.region) || undefined,
      country: text(saved.country) || undefined,
      latitude: saved.latitude,
      longitude: saved.longitude
    }
  } catch {
    return null
  }
}

export async function saveLocation(location: WeatherLocation): Promise<void> {
  try {
    await window.api?.config?.set(SAVED_LOCATION_KEY, location)
  } catch {
    // 保存失败不影响本次查看，下次重新定位即可
  }
}
