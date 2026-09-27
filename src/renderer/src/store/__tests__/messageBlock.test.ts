import type { KnowledgeItem } from '@renderer/types'
import { WEB_SEARCH_SOURCE } from '@renderer/types'
import type { CitationMessageBlock } from '@renderer/types/newMessage'
import { MessageBlockStatus, MessageBlockType } from '@renderer/types/newMessage'
import { describe, expect, it } from 'vitest'

import { formatCitationsFromBlock } from '../messageBlock'

const citationBlock = (knowledge: KnowledgeItem[]): CitationMessageBlock => ({
  id: 'blk',
  messageId: 'msg',
  type: MessageBlockType.CITATION,
  createdAt: '',
  status: MessageBlockStatus.SUCCESS,
  knowledge
})

const aiSdkBlock = (results: any[]): CitationMessageBlock => ({
  id: 'blk',
  messageId: 'msg',
  type: MessageBlockType.CITATION,
  createdAt: '',
  status: MessageBlockStatus.SUCCESS,
  response: { source: WEB_SEARCH_SOURCE.AISDK, results }
})

describe('formatCitationsFromBlock —— 知识库引用', () => {
  it('命中片段转成 knowledge 引用：标题用文件名、正文用片段、url 用原文件路径', () => {
    const citations = formatCitationsFromBlock(
      citationBlock([{ id: 'k1', file: '手册.md', path: 'D:/docs/手册.md', content: '保修期是两年', score: 0.8 }])
    )

    expect(citations).toHaveLength(1)
    expect(citations[0]).toMatchObject({
      number: 1,
      type: 'knowledge',
      title: '手册.md',
      content: '保修期是两年',
      url: 'D:/docs/手册.md',
      showFavicon: true
    })
  })

  it('同一文件的多条片段不会被按 url 去重折叠掉', () => {
    const citations = formatCitationsFromBlock(
      citationBlock([
        { id: 'k1', file: '手册.md', path: 'D:/docs/手册.md', content: '第一段', score: 0.8 },
        { id: 'k2', file: '手册.md', path: 'D:/docs/手册.md', content: '第二段', score: 0.7 }
      ])
    )

    expect(citations.map((c) => c.content)).toEqual(['第一段', '第二段'])
    expect(citations.map((c) => c.number)).toEqual([1, 2])
  })

  it('没有知识库片段时不产生引用', () => {
    expect(formatCitationsFromBlock(citationBlock([]))).toEqual([])
    expect(formatCitationsFromBlock(undefined)).toEqual([])
  })
})

describe('formatCitationsFromBlock —— AISDK 网络搜索', () => {
  it('畸形 url 且无标题时不抛错，用原始 url 兜底作标题', () => {
    const citations = formatCitationsFromBlock(aiSdkBlock([{ url: 'not a valid url', title: '' }]))

    expect(citations).toHaveLength(1)
    expect(citations[0]).toMatchObject({
      number: 1,
      url: 'not a valid url',
      title: 'not a valid url',
      type: 'websearch'
    })
  })

  it('合法 url 无标题时用 hostname 作标题', () => {
    const citations = formatCitationsFromBlock(aiSdkBlock([{ url: 'https://example.com/a', title: '' }]))

    expect(citations[0]).toMatchObject({ title: 'example.com' })
  })
})
