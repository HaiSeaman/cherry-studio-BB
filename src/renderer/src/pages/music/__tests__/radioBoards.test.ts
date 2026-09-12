import { describe, expect, it } from 'vitest'

import {
  BOARD_KEYS,
  BOARD_SUBS,
  type BoardGroup,
  type BoardKey,
  boardKeyOf,
  getBoardStations,
  isHlsStation,
  RADIO_BOARDS
} from '../services/radioBoards'
import type { RadioStation } from '../types'

const ALL_BOARD_KEYS: BoardKey[] = ['domestic_news', 'domestic_music', 'foreign_news', 'foreign_music']
const ALL_GROUPS: BoardGroup[] = ['domestic', 'foreign']

const custom = (url: string, name = '自定义台'): RadioStation => ({
  name,
  url,
  favicon: '',
  country: '自定义',
  tags: 'custom',
  bitrate: 0,
  codec: '',
  homepage: ''
})

describe('boardKeyOf 板块映射', () => {
  it('一级 + 二级 组合出四个板块 key', () => {
    expect(boardKeyOf('domestic', 'news')).toBe('domestic_news')
    expect(boardKeyOf('domestic', 'music')).toBe('domestic_music')
    expect(boardKeyOf('foreign', 'news')).toBe('foreign_news')
    expect(boardKeyOf('foreign', 'music')).toBe('foreign_music')
  })

  it('映射覆盖全部板块键，且每个键都能取到非空列表', () => {
    const mapped = ALL_GROUPS.flatMap((g) => BOARD_SUBS.map((s) => boardKeyOf(g, s)))
    expect(mapped).toHaveLength(ALL_GROUPS.length * BOARD_SUBS.length)
    expect([...mapped].sort()).toEqual([...ALL_BOARD_KEYS].sort())
    for (const key of mapped) expect(RADIO_BOARDS[key].length).toBeGreaterThan(0)
  })

  it('BOARD_KEYS 表与 boardKeyOf 结果一致', () => {
    for (const g of ALL_GROUPS) {
      for (const s of BOARD_SUBS) {
        expect(boardKeyOf(g, s)).toBe(BOARD_KEYS[g][s])
      }
    }
  })
})

describe('RADIO_BOARDS 板块数据', () => {
  it('四个板块齐全且均非空', () => {
    expect(Object.keys(RADIO_BOARDS).sort()).toEqual([...ALL_BOARD_KEYS].sort())
    for (const key of ALL_BOARD_KEYS) {
      expect(RADIO_BOARDS[key].length).toBeGreaterThan(0)
    }
  })

  it('每个电台字段完整：名称/地址/徽标/描述均非空，地址均为 http(s)', () => {
    for (const key of ALL_BOARD_KEYS) {
      for (const s of RADIO_BOARDS[key]) {
        expect(s.name.trim()).not.toBe('')
        expect(s.badge).toBeTruthy()
        expect(s.desc).toBeTruthy()
        expect(s.url).toMatch(/^https?:\/\//i)
      }
    }
  })

  it('板块内 url 唯一', () => {
    for (const key of ALL_BOARD_KEYS) {
      const urls = RADIO_BOARDS[key].map((s) => s.url)
      expect(new Set(urls).size).toBe(urls.length)
    }
  })

  it('跨板块 url 不重复（避免收藏/换台时同台多次出现）', () => {
    const urls = ALL_BOARD_KEYS.flatMap((k) => RADIO_BOARDS[k].map((s) => s.url))
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('codec 由原始 type 映射：m3u8→HLS、mp3→MP3、aac→AAC', () => {
    const all = ALL_BOARD_KEYS.flatMap((k) => RADIO_BOARDS[k])
    expect(all.filter((s) => s.codec === 'HLS').length).toBeGreaterThan(0)
    for (const s of all) {
      expect(['HLS', 'MP3', 'AAC']).toContain(s.codec)
    }
  })

  it('m3u8 流全部标记为 HLS（播放引擎据此走 hls.js）', () => {
    const all = ALL_BOARD_KEYS.flatMap((k) => RADIO_BOARDS[k])
    for (const s of all) {
      if (/\.m3u8($|\?)/i.test(s.url)) expect(s.codec).toBe('HLS')
    }
    // RTHK 等无 .m3u8 后缀的 HLS 流也必须是 HLS（靠数据里的 type 判定）
    const rthk = all.find((s) => s.url === 'https://stm.rthk.hk/radio1')
    expect(rthk?.codec).toBe('HLS')
  })
})

describe('isHlsStation', () => {
  it('codec 字段判定优先（不依赖 URL 形态）', () => {
    expect(isHlsStation('https://example.com/live', 'HLS')).toBe(true)
    expect(isHlsStation('https://example.com/live', 'AAC/HLS,MPEGURL')).toBe(true)
    expect(isHlsStation('https://example.com/live', 'MP3')).toBe(false)
  })

  it('识别无 .m3u8 后缀的板块 HLS 流（RTHK / 商业电台 / 新城）', () => {
    expect(isHlsStation('https://stm.rthk.hk/radio1')).toBe(true)
    expect(isHlsStation('https://stm.rthk.hk/radiopth')).toBe(true)
    expect(isHlsStation('https://stream.crhk.com.hk/881')).toBe(true)
    expect(isHlsStation('https://stream.metroradio.com.hk/997')).toBe(true)
  })

  it('.m3u8 后缀兜底（覆盖自定义电台与搜索来源）', () => {
    expect(isHlsStation('http://my/live.m3u8')).toBe(true)
    expect(isHlsStation('http://my/live.m3u8?token=1')).toBe(true)
  })

  it('普通 mp3 / aac 直连流判定为非 HLS', () => {
    expect(isHlsStation('https://lhttp.qtfm.cn/live/15318317/64k.mp3')).toBe(false)
    expect(isHlsStation('https://stream.radioparadise.com/aac-128')).toBe(false)
    expect(isHlsStation('https://lhttp.qtfm.cn/live/15318317/64k.mp3', 'MP3')).toBe(false)
  })
})

describe('getBoardStations', () => {
  it('无自定义电台时返回完整板块列表', () => {
    expect(getBoardStations('domestic_news', [])).toHaveLength(RADIO_BOARDS.domestic_news.length)
  })

  it('自定义电台并入尾部', () => {
    const list = getBoardStations('foreign_music', [custom('http://my/1', '我的台')])
    expect(list).toHaveLength(RADIO_BOARDS.foreign_music.length + 1)
    expect(list[list.length - 1].name).toBe('我的台')
  })

  it('与板块撞 url 时自定义优先：保留用户命名且列表内不重复', () => {
    const dupUrl = RADIO_BOARDS.domestic_news[0].url
    const list = getBoardStations('domestic_news', [custom(dupUrl, '我的中国之声')])
    // 板块中撞 url 的那台被剔除、由自定义补位 → 总条数不变，且该 url 只出现一次
    expect(list).toHaveLength(RADIO_BOARDS.domestic_news.length)
    expect(list.filter((s) => s.url === dupUrl)).toHaveLength(1)
    expect(list[list.length - 1].name).toBe('我的中国之声')
  })

  it('板块数据不被调用方修改（每次返回新数组）', () => {
    const a = getBoardStations('domestic_music', [])
    a.push(custom('http://mutated/1'))
    expect(getBoardStations('domestic_music', [])).toHaveLength(RADIO_BOARDS.domestic_music.length)
  })
})
