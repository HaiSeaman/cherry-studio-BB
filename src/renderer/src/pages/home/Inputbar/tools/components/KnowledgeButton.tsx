import { QuickPanelReservedSymbol } from '@renderer/components/QuickPanel'
import type { ToolQuickPanelController } from '@renderer/pages/home/Inputbar/types'
import { BookOpen, Check } from 'lucide-react'
import { memo, useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'

import { knowledgeAttachStore } from '../../../../knowledge/knowledgeAttachStore'
import { buildKnowledgePanel, updateSelection } from '../../../../knowledge/knowledgeQuickPanel'
import { KnowledgeService } from '../../../../knowledge/KnowledgeService'
import type { KnowledgeBase } from '../../../../knowledge/types'
import ToolActionIconButton from './ToolActionIconButton'

interface Props {
  quickPanelController: ToolQuickPanelController
}

/**
 * 知识库工具栏按钮（原生，与网络搜索/MCP 同排）。
 * 点击弹出 QuickPanel 浮层（与 MCP/网络搜索同款：可搜索、键盘导航、multiselect 勾选）；
 * 勾选即时生效，面板关闭后保持挂载，发送时由 Inputbar 读取注入检索结果。
 */
const KnowledgeButton = memo(({ quickPanelController }: Props) => {
  const [attached, setAttached] = useState<KnowledgeBase[]>(knowledgeAttachStore.get())

  useEffect(() => knowledgeAttachStore.subscribe(() => setAttached(knowledgeAttachStore.get())), [])

  const openPicker = useCallback(() => {
    void KnowledgeService.listBases().then((bases) => {
      // 同步收集器：勾选即时生效（不依赖 ctx.list 的异步旧值，避免最后一次勾选漏掉）
      const selected = new Set(knowledgeAttachStore.get().map((b) => b.id))
      const sync = () => knowledgeAttachStore.set(bases.filter((b) => selected.has(b.id)))

      const { items } = buildKnowledgePanel(bases, knowledgeAttachStore.get(), <BookOpen size={14} />)

      quickPanelController.open({
        title: '引用知识库',
        symbol: QuickPanelReservedSymbol.KnowledgeBase,
        multiple: true,
        pageSize: 8,
        list: [
          ...items,
          {
            label: '✓ 完成引用',
            icon: <Check size={14} />,
            isMenu: true,
            alwaysVisible: true,
            action: ({ context }) => {
              sync()
              context.close('click')
            }
          }
        ],
        // 基于回调携带的已更新 item 同步收集（QuickPanel 的 ctx.list 在回调时仍是旧值）
        afterAction: ({ item }) => {
          updateSelection(selected, item)
          sync()
        }
      })
    })
  }, [quickPanelController])

  return (
    <>
      <ToolActionIconButton
        tooltip={attached.length > 0 ? `已挂载 ${attached.length} 个知识库` : '知识库'}
        onClick={openPicker}
        active={attached.length > 0}
        aria-pressed={attached.length > 0}>
        {attached.length > 0 ? (
          <BadgeWrap>
            <BookOpen size={16} className="icon" />
            <Badge>{attached.length}</Badge>
          </BadgeWrap>
        ) : (
          <BookOpen size={16} className="icon" />
        )}
      </ToolActionIconButton>
    </>
  )
})

const BadgeWrap = styled.span`
  position: relative;
  display: inline-flex;
`

const Badge = styled.span`
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  padding: 0 3px;
`

export default KnowledgeButton
