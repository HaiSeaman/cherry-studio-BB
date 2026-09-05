import { describe, expect, it } from 'vitest'

import { filterChannels, groupByChannels } from '../services/channelService'
import type { IptvChannel } from '../types'

const ch = (id: number, name: string, group: string | null, url = `http://x/${id}`): IptvChannel => ({
  id,
  playlistId: 1,
  name,
  url,
  logo: null,
  group,
  tvgId: null
})

const CHANNELS = [
  ch(1, 'CCTV-1 综合', '央视'),
  ch(2, 'CCTV5+', '体育'),
  ch(3, '广西卫视', '广西'),
  ch(4, 'CCTV5 体育赛事', '体育'),
  ch(5, '未分组频道', null)
]

describe('filterChannels', () => {
  it('无分组无关键词 → 全部', () => {
    expect(filterChannels(CHANNELS, { group: null, keyword: '' })).toHaveLength(5)
  })

  it('按分组过滤', () => {
    const r = filterChannels(CHANNELS, { group: '体育', keyword: '' })
    expect(r.map((c) => c.name)).toEqual(['CCTV5+', 'CCTV5 体育赛事'])
  })

  it('关键词模糊匹配（大小写不敏感）', () => {
    const r = filterChannels(CHANNELS, { group: null, keyword: 'cctv5' })
    expect(r.map((c) => c.name)).toEqual(['CCTV5+', 'CCTV5 体育赛事'])
  })

  it('分组 + 关键词叠加', () => {
    const r = filterChannels(CHANNELS, { group: '体育', keyword: '赛事' })
    expect(r.map((c) => c.name)).toEqual(['CCTV5 体育赛事'])
  })

  it('空白关键词不参与过滤', () => {
    expect(filterChannels(CHANNELS, { group: null, keyword: '   ' })).toHaveLength(5)
  })

  it('无匹配返回空数组', () => {
    expect(filterChannels(CHANNELS, { group: null, keyword: '不存在的频道' })).toHaveLength(0)
  })
})

describe('groupByChannels', () => {
  it('按 group 聚合并保留首次出现顺序', () => {
    expect(groupByChannels(CHANNELS)).toEqual([
      { name: '央视', count: 1 },
      { name: '体育', count: 2 },
      { name: '广西', count: 1 },
      { name: '未分组', count: 1 }
    ])
  })

  it('空列表返回空数组', () => {
    expect(groupByChannels([])).toEqual([])
  })

  it('全部无分组 → 单一"未分组"', () => {
    expect(groupByChannels([ch(1, 'A', null), ch(2, 'B', null)])).toEqual([{ name: '未分组', count: 2 }])
  })
})
