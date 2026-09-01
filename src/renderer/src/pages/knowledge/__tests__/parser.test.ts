import { describe, expect, it } from 'vitest'

import { computeContentHash, extractExt, isSupportedExt, normalizeText } from '../parser'

describe('normalizeText', () => {
  it('去掉 BOM 头', () => {
    expect(normalizeText('\uFEFFhello')).toBe('hello')
  })

  it('把 \\r\\n 与 \\r 归一化为 \\n', () => {
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('去掉首尾空白', () => {
    expect(normalizeText('  hi  \n')).toBe('hi')
  })
})

describe('isSupportedExt', () => {
  it('大小写不敏感', () => {
    expect(isSupportedExt('.PDF')).toBe(true)
    expect(isSupportedExt('.Docx')).toBe(true)
  })

  it('不支持的类型返回 false', () => {
    expect(isSupportedExt('.exe')).toBe(false)
    expect(isSupportedExt('.pptx')).toBe(false)
  })
})

describe('extractExt', () => {
  it('正常文件取扩展名（小写）', () => {
    expect(extractExt('C:\\docs\\readme.TXT')).toBe('.txt')
    expect(extractExt('/home/u/a.b.tar')).toBe('.tar')
  })

  it('无扩展名文件名返回空', () => {
    expect(extractExt('C:\\docs\\README')).toBe('')
  })

  it('隐藏文件（.env）视为无扩展名', () => {
    expect(extractExt('C:\\docs\\.env')).toBe('')
  })
})

describe('computeContentHash', () => {
  it('对同一字符串两次计算得到一致的 sha256', async () => {
    const a = await computeContentHash('知识库测试内容')
    const b = await computeContentHash('知识库测试内容')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('不同内容得到不同哈希', async () => {
    const a = await computeContentHash('abc')
    const b = await computeContentHash('abd')
    expect(a).not.toBe(b)
  })
})
