import { beforeEach, describe, expect, it } from 'vitest'

import { addExcludedUrl, getExcludedUrls } from '../services/radioCache'

describe('radioCache 排除清单', () => {
  beforeEach(() => {
    localStorage.removeItem('music_radio_excluded')
  })

  it('初值为空数组', () => {
    expect(getExcludedUrls()).toEqual([])
  })

  it('新增去重且保持顺序', () => {
    addExcludedUrl('http://x/1')
    addExcludedUrl('http://x/1')
    addExcludedUrl('http://x/2')
    expect(getExcludedUrls()).toEqual(['http://x/1', 'http://x/2'])
  })

  it('本地存储内容损坏时回退空数组', () => {
    localStorage.setItem('music_radio_excluded', '{ not json')
    expect(getExcludedUrls()).toEqual([])
  })
})
