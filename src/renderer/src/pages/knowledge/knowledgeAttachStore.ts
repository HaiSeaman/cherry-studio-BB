import type { KnowledgeBase } from './types'

/**
 * 聊天气泡当前挂载的知识库（模块级轻量 store，订阅式）。
 * 知识库工具栏按钮写、Inputbar 发送时读，避免为此改 redux。
 */
type Listener = () => void

let attached: KnowledgeBase[] = []
const listeners = new Set<Listener>()

export const knowledgeAttachStore = {
  set(bases: KnowledgeBase[]): void {
    attached = bases
    for (const l of listeners) l()
  },
  get(): KnowledgeBase[] {
    return attached
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
}
