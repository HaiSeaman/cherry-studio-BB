import { describe, expect, it } from 'vitest'

import { parseM3U, selectEngine } from '../services/m3uService'

/** 计划 §11.3 测试样例 */
const SAMPLE = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="CCTV1" tvg-logo="http://logo/cctv1.png" group-title="央视",CCTV-1 综合',
  'http://example.com/cctv1.m3u8',
  '#EXTINF:-1 tvg-logo="http://logo/gx.png" group-title="广西",广西卫视',
  'http://example.com/gx.ts',
  '#EXTINF:-1 group-title="体育",CCTV5+',
  'http://example.com/cctv5.mp4'
].join('\n')

describe('parseM3U', () => {
  it('解析 5 字段（name/url/logo/group/tvgId）', () => {
    const items = parseM3U(SAMPLE)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({
      name: 'CCTV-1 综合',
      url: 'http://example.com/cctv1.m3u8',
      logo: 'http://logo/cctv1.png',
      group: '央视',
      tvgId: 'CCTV1'
    })
    expect(items[1]).toMatchObject({ name: '广西卫视', url: 'http://example.com/gx.ts' })
  })

  it('缺失属性归一化为 null（解析器返回空字符串，非 undefined）', () => {
    const items = parseM3U(SAMPLE)
    // CCTV5+ 无 tvg-logo / tvg-id → 解析器返回 ''
    expect(items[2].logo).toBeNull()
    expect(items[2].tvgId).toBeNull()
  })

  it('空文本返回空数组', () => {
    expect(parseM3U('')).toHaveLength(0)
  })

  it('无频道的 M3U 返回空数组', () => {
    expect(parseM3U('#EXTM3U')).toHaveLength(0)
  })

  it('保留原始顺序', () => {
    expect(parseM3U(SAMPLE).map((c) => c.name)).toEqual(['CCTV-1 综合', '广西卫视', 'CCTV5+'])
  })
})

describe('selectEngine', () => {
  it('.m3u8 → hls', () => {
    expect(selectEngine('http://example.com/cctv1.m3u8')).toBe('hls')
  })

  it('带 query 的 .m3u8 → hls', () => {
    expect(selectEngine('http://example.com/live.m3u8?token=abc')).toBe('hls')
  })

  it('.ts → mpegts', () => {
    expect(selectEngine('http://example.com/gx.ts')).toBe('mpegts')
  })

  it('.mpegts / .flv → mpegts', () => {
    expect(selectEngine('http://example.com/stream.mpegts')).toBe('mpegts')
    expect(selectEngine('http://example.com/live.flv?token=1')).toBe('mpegts')
  })

  it('.mp4 及未知 → native', () => {
    expect(selectEngine('http://example.com/cctv5.mp4')).toBe('native')
    expect(selectEngine('http://example.com/unknown/stream')).toBe('native')
  })

  it('url 中间含 m3u8 但不以之为后缀 → native（不做模糊匹配）', () => {
    expect(selectEngine('http://example.com/m3u8-folder/video.mp4')).toBe('native')
  })
})
