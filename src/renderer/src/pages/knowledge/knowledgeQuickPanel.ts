import type { QuickPanelListItem } from '@renderer/components/QuickPanel'
import type { ReactNode } from 'react'

import type { KnowledgeBase } from './types'

/** QuickPanel 面板行：在原类型上加 kbId 供提交时按 id 反查库（面板浅拷贝会保留该字段） */
type KBListItem = QuickPanelListItem & { kbId: string }

export interface KnowledgePanelResult {
  /** QuickPanel 列表项（知识库一项） */
  items: QuickPanelListItem[]
  /**
   * 收集当前面板中勾选的库（供提交时调用）。
   * @param currentList 面板的实时列表（ctx.list，含勾选状态）
   */
  picked: (currentList: QuickPanelListItem[]) => KnowledgeBase[]
}

/**
 * 构建聊天「引用知识库」QuickPanel 面板数据（纯函数，可测）。
 * 面板为多选模式：点击项切换勾选，提交时从 currentList 收集勾选库。
 * 注意：QuickPanel 更新勾选态时用浅拷贝替换该项（保留全部字段），
 * 因此这里把库 id 放在 item.kbId 上而非按对象引用反查。
 * @param icon 每行图标（默认 📚；实际调用可传 <BookOpen />）
 */
export function buildKnowledgePanel(
  bases: KnowledgeBase[],
  attached: KnowledgeBase[],
  icon: ReactNode = '📚'
): KnowledgePanelResult {
  const attachedIds = new Set(attached.map((b) => b.id))
  const byId = new Map(bases.map((b) => [b.id, b]))

  const items: KBListItem[] = bases.map((base) => ({
    label: base.name,
    icon,
    isSelected: attachedIds.has(base.id),
    filterText: base.name,
    kbId: base.id
  }))

  const picked = (currentList: QuickPanelListItem[]): KnowledgeBase[] =>
    currentList
      .filter((i) => i.isSelected && !i.isMenu)
      .map((i) => byId.get((i as KBListItem).kbId))
      .filter((b): b is KnowledgeBase => Boolean(b))

  return { items, picked }
}

/**
 * 同步收集勾选状态（修复 QuickPanel 时序问题）：
 * 面板多选模式下，勾选回调（afterAction 的 item）携带的是**已更新**的浅拷贝项，
 * 而 ctx.list 是异步 setState 的旧值——若从 ctx.list 收集会漏掉最后一次勾选。
 * 本函数只依赖回调里的 item（同步数据），把库 id 增删到 selected 集合。
 * @param selected 已选库 id 集合（变更是同步的）
 * @param item 面板回调传入的项（含最新 isSelected）
 */
export function updateSelection(selected: Set<string>, item: QuickPanelListItem): void {
  const kbItem = item as KBListItem | undefined
  if (!kbItem?.kbId || kbItem.isMenu) return
  if (item.isSelected) selected.add(kbItem.kbId)
  else selected.delete(kbItem.kbId)
}
