import type { RadioStation } from '../types'

/**
 * FM 电台本地缓存（localStorage）：
 * - 列表缓存 7 天有效（控制栏 ↻ 强制刷新时调 clearRadioCache）
 * - 在线电台 ✕ 排除清单（永久隐藏）
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const TOP_KEY = 'music_radio_cache_top'
const CNHK_KEY = 'music_radio_cache_cnhk'
const EXCLUDED_KEY = 'music_radio_excluded'

export type RadioTopCache = { stations: RadioStation[]; chinaHk: RadioStation[]; fetchedAt: number }
export type RadioCnHkCache = { stations: RadioStation[]; fetchedAt: number }

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储满等异常直接忽略，缓存非关键数据
  }
}

export function getCachedTop(): RadioTopCache | null {
  const cache = readJson<RadioTopCache>(TOP_KEY)
  if (!cache || !Array.isArray(cache.stations) || !Array.isArray(cache.chinaHk)) return null
  if (Date.now() - cache.fetchedAt > SEVEN_DAYS_MS) return null
  return cache
}

export function setCachedTop(stations: RadioStation[], chinaHk: RadioStation[]): void {
  writeJson(TOP_KEY, { stations, chinaHk, fetchedAt: Date.now() })
}

export function getCachedCnHk(): RadioCnHkCache | null {
  const cache = readJson<RadioCnHkCache>(CNHK_KEY)
  if (!cache || !Array.isArray(cache.stations)) return null
  if (Date.now() - cache.fetchedAt > SEVEN_DAYS_MS) return null
  return cache
}

export function setCachedCnHk(stations: RadioStation[]): void {
  writeJson(CNHK_KEY, { stations, fetchedAt: Date.now() })
}

export function clearRadioCache(): void {
  localStorage.removeItem(TOP_KEY)
  localStorage.removeItem(CNHK_KEY)
}

export function getExcludedUrls(): string[] {
  const list = readJson<string[]>(EXCLUDED_KEY)
  return Array.isArray(list) ? list : []
}

export function addExcludedUrl(url: string): void {
  const list = getExcludedUrls()
  if (!list.includes(url)) {
    list.push(url)
    writeJson(EXCLUDED_KEY, list)
  }
}
