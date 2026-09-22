import { describe, expect, it } from 'vitest'

import { chunkText, estimateTokens } from '../chunker'

// 中文 1 字符≈1 token、英文/数字 4 字符≈1 token 的粗估
describe('estimateTokens', () => {
  it('纯中文按字符数', () => {
    expect(estimateTokens('人工智能')).toBe(4)
  })
  it('纯英文按 4 字符 1 token（向上取整）', () => {
    expect(estimateTokens('abcd')).toBe(1)
  })
})

describe('chunkText', () => {
  it('空文本返回空数组', () => {
    expect(chunkText('', 'line', 100, 10)).toEqual([])
  })

  it('短文本切为单块且保留原文', () => {
    const r = chunkText('短文本内容', 'line', 100, 10)
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe('短文本内容')
  })

  it('长文本切成多块，且每块 token 不超过上限(留 margin)', () => {
    const long = Array.from({ length: 50 }, (_, i) => `第${i}段内容，用于测试切块边界。`).join('\n')
    const r = chunkText(long, 'line', 100, 0)
    expect(r.length).toBeGreaterThan(1)
    for (const c of r) {
      expect(estimateTokens(c.text)).toBeLessThanOrEqual(100 + 10)
    }
  })

  it('相邻块之间按 overlap 产生重叠内容', () => {
    const long = Array.from({ length: 40 }, (_, i) => `段落${i}：这里有若干文本内容用于切分验证重叠。`).join('\n')
    const r = chunkText(long, 'line', 60, 20)
    expect(r.length).toBeGreaterThan(1)
    // 第二块的文本应包含第一块尾部的一部分（重叠）
    const tailOfFirst = r[0].text.split('\n').slice(-1)[0]
    expect(r[1].text).toContain(tailOfFirst)
  })

  it('line 类块的 source 行号连续且不重叠', () => {
    const lines = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const r = chunkText(lines.join('\n'), 'line', 3, 0)
    expect(r.length).toBeGreaterThan(1)
    // 第一块从第 1 行开始
    expect(r[0].source).toMatchObject({ type: 'line', lineStart: 1 })
    // 行号连续：上一块的 lineEnd+1 === 下一块的 lineStart
    for (let i = 1; i < r.length; i++) {
      expect(r[i].source).toMatchObject({ type: 'line', lineStart: (r[i - 1].source.lineEnd ?? 0) + 1 })
    }
  })

  it('flow 类块不带行号，使用 para 序号', () => {
    const r = chunkText('第一段。第二段。第三段。第四段。', 'flow', 3, 0)
    expect(r.length).toBeGreaterThan(1)
    expect(r[0].source.type).toBe('para')
  })

  it('单行极长也切成不超上限的若干块（不会产生超限块）', () => {
    const oneLine = '人工智能'.repeat(400) // 400 中文 token，远大于上限
    const r = chunkText(oneLine, 'line', 50, 0)
    expect(r.length).toBeGreaterThan(1)
    for (const c of r) {
      expect(estimateTokens(c.text)).toBeLessThanOrEqual(50 + 10)
      expect(c.text).not.toBe('')
    }
  })
})

describe('chunkText 标题层级上下文', () => {
  // 标题结构：# 手册 > ## 保修 / ## 退换
  const md = ['# 手册', '## 保修', '保修期是两年。', '## 退换', '七天内可退换。'].join('\n')
  const bodyOf = (r: ReturnType<typeof chunkText>, key: string) => r.find((c) => c.text.includes(key))!

  it('标题下的正文块带上标题层级', () => {
    const r = chunkText(md, 'line', 8, 0)
    expect(bodyOf(r, '保修期是两年。').text).toBe('手册 > 保修\n保修期是两年。')
  })

  it('同级标题切换后，正文块改用新的标题路径', () => {
    const r = chunkText(md, 'line', 8, 0)
    expect(bodyOf(r, '七天内可退换。').text).toBe('手册 > 退换\n七天内可退换。')
  })

  it('标题块自身只带父级路径，不重复自己', () => {
    const r = chunkText(md, 'line', 8, 0)
    expect(bodyOf(r, '## 退换').text).toBe('手册\n## 退换')
  })

  it('没有标题的文本不加任何前缀', () => {
    const r = chunkText('第一行\n第二行', 'line', 100, 0)
    expect(r[0].text).toBe('第一行\n第二行')
  })
})
