import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildTryUrls,
  BUILTIN_CN_HK_MUSIC_STATIONS,
  BUILTIN_CN_MUSIC_STATIONS,
  dedupStationsByUrl,
  fetchStations,
  isPlayableCnHk,
  RADIO_DEFAULT_API,
  RADIO_FALLBACKS,
  radioGetMirror,
  radioNormalizeStation,
  withBuiltinCnHk
} from '../services/radioApi'
import type { RadioStation } from '../types'

const station = (partial: Partial<RadioStation>): RadioStation => ({
  name: '测试电台',
  url: 'http://example.com/stream',
  favicon: 'http://example.com/icon.png',
  country: 'China',
  tags: 'music',
  bitrate: 128,
  codec: 'MP3',
  homepage: 'http://example.com',
  ...partial
})

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('radioGetMirror', () => {
  it('all 地址随机返回三镜像之一', () => {
    const mirrors = [
      'https://de1.api.radio-browser.info',
      'https://nl1.api.radio-browser.info',
      'https://at1.api.radio-browser.info'
    ]
    for (let i = 0; i < 30; i++) {
      expect(mirrors).toContain(radioGetMirror(RADIO_DEFAULT_API))
    }
  })

  it('自定义地址原样返回（不随机）', () => {
    expect(radioGetMirror('https://my-proxy.example.com')).toBe('https://my-proxy.example.com')
  })
})

describe('buildTryUrls', () => {
  it('固定镜像时容灾顺序为 首选+其余镜像 且去重', () => {
    const urls = buildTryUrls('https://de1.api.radio-browser.info')
    expect(urls).toEqual([
      'https://de1.api.radio-browser.info',
      'https://nl1.api.radio-browser.info',
      'https://at1.api.radio-browser.info'
    ])
    expect(urls.length).toBe(new Set(urls).size)
    expect(urls.length).toBeLessThanOrEqual(RADIO_FALLBACKS.length)
  })
})

describe('radioNormalizeStation', () => {
  it('非对象返回 null', () => {
    expect(radioNormalizeStation(null)).toBeNull()
    expect(radioNormalizeStation('x')).toBeNull()
  })

  it('缺少 url 或非 http(s) 返回 null', () => {
    expect(radioNormalizeStation({ name: 'x' })).toBeNull()
    expect(radioNormalizeStation({ name: 'x', url: 'ftp://a/b' })).toBeNull()
  })

  it('支持 streamurl 备选字段，合法 url 超 1024 截断保留', () => {
    expect(radioNormalizeStation({ name: 'x', streamurl: 'http://a/b' })?.url).toBe('http://a/b')
    const s = radioNormalizeStation({ name: 'x', url: 'http://a/' + 'b'.repeat(1100) })!
    expect(s.url.length).toBe(1024)
  })

  it('字段按上限截断', () => {
    const s = radioNormalizeStation({
      name: 'n'.repeat(200),
      url: 'http://a/b',
      favicon: 'http://a/f',
      country: 'c'.repeat(100),
      tags: 't'.repeat(300),
      codec: 'c'.repeat(40),
      homepage: 'h'.repeat(600)
    })!
    expect(s.name.length).toBe(128)
    expect(s.country.length).toBe(64)
    expect(s.tags.length).toBe(256)
    expect(s.codec.length).toBe(32)
    expect(s.homepage.length).toBe(512)
  })

  it('favicon 非 http(s) 置空，tags 数组拼接，bitrate 非数字为 0', () => {
    const s = radioNormalizeStation({
      name: 'x',
      url: 'http://a/b',
      favicon: 'file:///etc/passwd',
      tags: ['a', 'b'],
      bitrate: 'abc'
    })!
    expect(s.favicon).toBe('')
    expect(s.tags).toBe('a,b')
    expect(s.bitrate).toBe(0)
  })
})

describe('dedupStationsByUrl', () => {
  it('按 url 去重且先出现的优先（参数顺序即优先级）', () => {
    const a = [station({ name: 'A1', url: 'http://x/1' }), station({ name: 'A2', url: 'http://x/2' })]
    const b = [station({ name: 'B1', url: 'http://x/1' }), station({ name: 'B2', url: 'http://x/3' })]
    const merged = dedupStationsByUrl(a, b)
    expect(merged.map((s) => s.name)).toEqual(['A1', 'A2', 'B2'])
  })
})

describe('isPlayableCnHk', () => {
  it('剔除 HLS / m3u8 / 低码率', () => {
    expect(isPlayableCnHk(station({ codec: 'HLS' }))).toBe(false)
    expect(isPlayableCnHk(station({ codec: 'AAC/HLS,MPEGURL' }))).toBe(false)
    expect(isPlayableCnHk(station({ url: 'http://a/playlist.m3u8' }))).toBe(false)
    expect(isPlayableCnHk(station({ bitrate: 32 }))).toBe(false)
    expect(isPlayableCnHk(station({ bitrate: 64 }))).toBe(true)
  })
})

describe('内置精选电台', () => {
  it('4 个 RTHK 电台且流地址正确', () => {
    expect(BUILTIN_CN_HK_MUSIC_STATIONS).toHaveLength(4)
    expect(BUILTIN_CN_HK_MUSIC_STATIONS.map((s) => s.name)).toEqual([
      'RTHK Radio 1',
      'RTHK Radio 2',
      'RTHK Radio 3',
      'RTHK Radio 4'
    ])
    expect(BUILTIN_CN_HK_MUSIC_STATIONS[0].url).toBe('http://rthkaudio1.rthk.hk:80/')
  })

  it('中文音乐台含清晨音乐台并排最前，withBuiltinCnHk 合并顺序：中文精选→RTHK→自定义→线上', () => {
    expect(BUILTIN_CN_MUSIC_STATIONS.length).toBeGreaterThanOrEqual(11)
    expect(BUILTIN_CN_MUSIC_STATIONS[0].name).toBe('清晨音乐台')
    expect(BUILTIN_CN_MUSIC_STATIONS.every((s) => /^https?:\/\//.test(s.url) && !s.url.includes('.m3u8'))).toBe(true)

    const online = [station({ name: '线上台', url: 'http://online/1' })]
    const custom = [station({ name: '自定义台', url: 'http://custom/1' })]
    const merged = withBuiltinCnHk(online, custom)
    expect(merged[0].name).toBe('清晨音乐台')
    expect(merged.findIndex((s) => s.name === 'RTHK Radio 1')).toBeLessThan(
      merged.findIndex((s) => s.name === '自定义台')
    )
    expect(merged[merged.length - 1].name).toBe('线上台')
    expect(merged).toHaveLength(BUILTIN_CN_MUSIC_STATIONS.length + BUILTIN_CN_HK_MUSIC_STATIONS.length + 2)
  })
})

describe('fetchStations 镜像容灾', () => {
  it('首选镜像失败自动切换备用镜像', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('net down'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ name: 'OK', url: 'http://ok/1', tags: 'music', bitrate: 128 }]), {
          headers: { 'content-type': 'application/json' }
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const list = await fetchStations('https://de1.api.radio-browser.info', 5000, '/json/stations/topvote/50')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('OK')
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toBe('https://de1.api.radio-browser.info/json/stations/topvote/50')
    expect(urls[1]).toBe('https://nl1.api.radio-browser.info/json/stations/topvote/50')
  })

  it('全部镜像失败时抛出最后一个错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('all down')))
    await expect(
      fetchStations('https://de1.api.radio-browser.info', 5000, '/json/stations/topvote/50')
    ).rejects.toThrow('all down')
  })

  it('请求超时中止', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: any, init: any) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')))
          })
      )
    )
    await expect(fetchStations('https://de1.api.radio-browser.info', 50, '/json/stations/topvote/50')).rejects.toThrow()
  }, 10000)
})
