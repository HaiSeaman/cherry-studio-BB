import { describe, expect, it, vi } from 'vitest'

import type { RadioStation } from '../types'
import { addExcludedUrl, clearRadioCache, getCachedCnHk, getCachedTop, getExcludedUrls, setCachedCnHk, setCachedTop } from '../services/radioCache'

const st = (url: string): RadioStation => ({ name: 'x', url, favicon: '', country: '', tags: '', bitrate: 128, codec: 'MP3', homepage: '' })

describe('radioCache', () => {
  it('热门榜缓存 7 天内有效，过期返回 null', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T00:00:00Z'))
    setCachedTop([st('http://a/1')], [st('http://b/1')])
    expect(getCachedTop()).not.toBeNull()
    expect(getCachedTop()!.stations).toHaveLength(1)

    vi.setSystemTime(new Date('2026-08-22T00:00:00Z')) // 6 天
    expect(getCachedTop()).not.toBeNull()
    vi.setSystemTime(new Date('2026-08-24T00:00:00Z')) // 8 天
    expect(getCachedTop()).toBeNull()
    vi.useRealTimers()
  })

  it('中港音乐缓存读写与清空', () => {
    setCachedCnHk([st('http://c/1')])
    expect(getCachedCnHk()?.stations).toHaveLength(1)
    clearRadioCache()
    expect(getCachedCnHk()).toBeNull()
  })

  it('排除清单去重且持久', () => {
    localStorage.removeItem('music_radio_excluded')
    addExcludedUrl('http://x/1')
    addExcludedUrl('http://x/1')
    addExcludedUrl('http://x/2')
    expect(getExcludedUrls()).toEqual(['http://x/1', 'http://x/2'])
    localStorage.removeItem('music_radio_excluded')
  })
})
