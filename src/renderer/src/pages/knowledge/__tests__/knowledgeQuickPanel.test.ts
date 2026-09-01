import type { QuickPanelListItem } from '@renderer/components/QuickPanel'
import { describe, expect, it } from 'vitest'

import { buildKnowledgePanel, updateSelection } from '../knowledgeQuickPanel'
import type { KnowledgeBase } from '../types'

const makeBase = (id: string, name: string): KnowledgeBase => ({
  id,
  name,
  embedding_model_id: 'm',
  embedding_provider_id: 'p',
  embedding_dim: 1024,
  chunk_size: 512,
  chunk_overlap: 80,
  top_k: 6,
  created_at: '',
  updated_at: ''
})

describe('buildKnowledgePanel', () => {
  it('空库生成空面板列表', () => {
    const { items } = buildKnowledgePanel([], [])
    expect(items).toEqual([])
  })

  it('按已挂载的库标记 isSelected', () => {
    const a = makeBase('a', '产品手册')
    const b = makeBase('b', 'API文档')
    const { items } = buildKnowledgePanel([a, b], [a])
    expect(items[0].isSelected).toBe(true)
    expect(items[1].isSelected).toBe(false)
  })

  it('picked 只收集已选中项且返回完整库对象', () => {
    const a = makeBase('a', '产品手册')
    const b = makeBase('b', 'API文档')
    const { items, picked } = buildKnowledgePanel([a, b], [])
    // 模拟面板状态：仅第一项被勾选
    const list = items.map((it, i) => ({ ...it, isSelected: i === 0 }))
    const result = picked(list)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })

  it('取消勾选后 picked 不再包含该库', () => {
    const a = makeBase('a', '产品手册')
    const { items, picked } = buildKnowledgePanel([a], [a])
    const list = items.map((it) => ({ ...it, isSelected: false }))
    expect(picked(list)).toEqual([])
  })
})

/** 模拟面板项：kbId 即知识库 id，isMenu 为菜单项（如“完成”） */
const item = (kbId: string | undefined, isSelected: boolean, isMenu = false): QuickPanelListItem =>
  ({ kbId, isSelected, isMenu, label: kbId ?? '全部', icon: '' }) as QuickPanelListItem

describe('updateSelection（勾选即时同步收集）', () => {
  it('勾选（isSelected=true）把库加入已选集合', () => {
    const sel = new Set<string>()
    updateSelection(sel, item('a', true))
    expect(sel.has('a')).toBe(true)
  })

  it('取消勾选（isSelected=false）把库移出集合', () => {
    const sel = new Set(['a', 'b'])
    updateSelection(sel, item('a', false))
    expect(sel.has('a')).toBe(false)
    expect(sel.has('b')).toBe(true)
  })

  it('isMenu 项（如“完成引用”）不参与勾选收集', () => {
    const sel = new Set<string>()
    updateSelection(sel, item('done', true, true))
    expect(sel.size).toBe(0)
  })

  it('无 kbId 的非知识库项被忽略', () => {
    const sel = new Set(['a'])
    updateSelection(sel, item(undefined, true))
    expect(sel.has('a')).toBe(true)
    expect(sel.size).toBe(1)
  })
})
