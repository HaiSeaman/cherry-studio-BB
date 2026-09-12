/**
 * FM 电台本地持久化（localStorage）：
 * - 排除清单：列表 ✕ 隐藏的电台 url（永久）
 * 板块电台为打包内置静态数据，无需网络缓存；搜索结果不落缓存。
 */

const EXCLUDED_KEY = 'music_radio_excluded'

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
    // 存储满等异常直接忽略，非关键数据
  }
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
