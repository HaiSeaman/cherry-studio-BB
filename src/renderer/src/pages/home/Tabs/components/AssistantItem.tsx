import AssistantAvatar from '@renderer/components/Avatar/AssistantAvatar'
import { CopyIcon, DeleteIcon, EditIcon } from '@renderer/components/Icons'
import PromptPopup from '@renderer/components/Popups/PromptPopup'
import { useAssistant, useAssistants } from '@renderer/hooks/useAssistant'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTags } from '@renderer/hooks/useTags'
import AssistantSettingsPopup from '@renderer/pages/settings/AssistantSettings'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import type { Assistant, AssistantsSortType } from '@renderer/types'
import { cn } from '@renderer/utils'
import { hasTopicPendingRequests } from '@renderer/utils/queue'
import type { MenuProps } from 'antd'
import { Dropdown } from 'antd'
import {
  AlignJustify,
  ArrowDownAZ,
  ArrowUpAZ,
  BrushCleaning,
  Check,
  MoreVertical,
  Plus,
  Settings2,
  Smile,
  Tag,
  Tags
} from 'lucide-react'
import type { FC, PropsWithChildren } from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import * as tinyPinyin from 'tiny-pinyin'

import AssistantTagsPopup from './AssistantTagsPopup'

interface AssistantItemProps {
  assistant: Assistant
  isActive: boolean
  sortBy: AssistantsSortType
  onSwitch: (assistant: Assistant) => void
  onDelete: (assistant: Assistant) => void
  copyAssistant: (assistant: Assistant) => void
  onTagClick?: (tag: string) => void
  handleSortByChange?: (sortType: AssistantsSortType) => void
  sortByPinyinAsc?: () => void
  sortByPinyinDesc?: () => void
}

const AssistantItem: FC<AssistantItemProps> = ({
  assistant,
  isActive,
  sortBy,
  onSwitch,
  onDelete,
  copyAssistant,
  handleSortByChange,
  sortByPinyinAsc: externalSortByPinyinAsc,
  sortByPinyinDesc: externalSortByPinyinDesc
}) => {
  const { allTags } = useTags()
  const { removeAllTopics } = useAssistant(assistant.id)
  const { clickAssistantToShowTopic, topicPosition, setAssistantIconType } = useSettings()
  const { assistants, updateAssistants } = useAssistants()

  const [isPending, setIsPending] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (isActive) {
      setIsPending(false)
      return
    }

    const hasPending = assistant.topics.some((topic) => hasTopicPendingRequests(topic.id))
    setIsPending(hasPending)
  }, [isActive, assistant.topics])

  // Local sort functions
  const localSortByPinyinAsc = useCallback(() => {
    updateAssistants(sortAssistantsByPinyin(assistants, true))
  }, [assistants, updateAssistants])

  const localSortByPinyinDesc = useCallback(() => {
    updateAssistants(sortAssistantsByPinyin(assistants, false))
  }, [assistants, updateAssistants])

  // Use external sort functions if provided, otherwise use local ones
  const sortByPinyinAsc = externalSortByPinyinAsc || localSortByPinyinAsc
  const sortByPinyinDesc = externalSortByPinyinDesc || localSortByPinyinDesc

  const menuItems = useMemo(
    () =>
      getMenuItems({
        assistant,
        allTags,
        assistants,
        updateAssistants,
        copyAssistant,
        onSwitch,
        onDelete,
        removeAllTopics,
        setAssistantIconType,
        sortBy,
        handleSortByChange,
        sortByPinyinAsc,
        sortByPinyinDesc
      }),
    [
      assistant,
      allTags,
      assistants,
      updateAssistants,
      copyAssistant,
      onSwitch,
      onDelete,
      removeAllTopics,
      setAssistantIconType,
      sortBy,
      handleSortByChange,
      sortByPinyinAsc,
      sortByPinyinDesc
    ]
  )

  const handleSwitch = useCallback(async () => {
    if (clickAssistantToShowTopic) {
      if (topicPosition === 'left') {
        EventEmitter.emit(EVENT_NAMES.SWITCH_TOPIC_SIDEBAR)
      }
    }
    onSwitch(assistant)
  }, [clickAssistantToShowTopic, onSwitch, assistant, topicPosition])

  const assistantName = useMemo(() => assistant.name || '默认助手', [assistant.name])
  const fullAssistantName = useMemo(
    () => (assistant.emoji ? `${assistant.emoji} ${assistantName}` : assistantName),
    [assistant.emoji, assistantName]
  )

  const handleMenuButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['contextMenu']}
      popupRender={(menu) => <div onPointerDown={(e) => e.stopPropagation()}>{menu}</div>}>
      <Container
        onClick={handleSwitch}
        isActive={isActive}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}>
        <AssistantNameRow className="name" title={fullAssistantName}>
          <AssistantAvatar
            assistant={assistant}
            size={24}
            className={isPending && !isActive ? 'animation-pulse' : ''}
          />
          <AssistantName className="text-nowrap">{assistantName}</AssistantName>
        </AssistantNameRow>
        {(isActive || isHovered) && (
          <Dropdown
            menu={{ items: menuItems }}
            trigger={['click']}
            popupRender={(menu) => <div onPointerDown={(e) => e.stopPropagation()}>{menu}</div>}>
            <MenuButton onClick={handleMenuButtonClick}>
              <MoreVertical size={14} className="text-(--color-text-secondary)" />
            </MenuButton>
          </Dropdown>
        )}
      </Container>
    </Dropdown>
  )
}

// 提取排序相关的工具函数
const sortAssistantsByPinyin = (assistants: Assistant[], isAscending: boolean) => {
  return [...assistants].sort((a, b) => {
    const pinyinA = tinyPinyin.convertToPinyin(a.name, '', true)
    const pinyinB = tinyPinyin.convertToPinyin(b.name, '', true)
    return isAscending ? pinyinA.localeCompare(pinyinB) : pinyinB.localeCompare(pinyinA)
  })
}

// 提取标签相关的操作函数
const handleTagOperation = (
  tag: string,
  assistant: Assistant,
  assistants: Assistant[],
  updateAssistants: (assistants: Assistant[]) => void
) => {
  const removeTag = () => updateAssistants(assistants.map((a) => (a.id === assistant.id ? { ...a, tags: [] } : a)))
  const addTag = () => updateAssistants(assistants.map((a) => (a.id === assistant.id ? { ...a, tags: [tag] } : a)))
  const hasTag = assistant.tags?.includes(tag)
  hasTag ? removeTag() : addTag()
}

// 提取创建菜单项的函数
const createTagMenuItems = (
  allTags: string[],
  assistant: Assistant,
  assistants: Assistant[],
  updateAssistants: (assistants: Assistant[]) => void
): MenuProps['items'] => {
  const items: MenuProps['items'] = [
    ...allTags.map((tag) => ({
      label: tag,
      icon: assistant.tags?.includes(tag) ? <Check size={14} /> : <Tag size={14} />,
      key: `all-tag-${tag}`,
      onClick: () => handleTagOperation(tag, assistant, assistants, updateAssistants)
    }))
  ]

  if (allTags.length > 0) {
    items.push({ type: 'divider' })
  }

  items.push({
    label: '添加标签',
    key: 'new-tag',
    icon: <Plus size={14} />,
    onClick: async () => {
      const tagName = await PromptPopup.show({
        title: '添加标签',
        message: ''
      })

      if (tagName && tagName.trim()) {
        updateAssistants(assistants.map((a) => (a.id === assistant.id ? { ...a, tags: [tagName.trim()] } : a)))
      }
    }
  })

  if (allTags.length > 0) {
    items.push({
      label: '标签管理',
      key: 'manage-tags',
      icon: <Settings2 size={14} />,
      onClick: () => {
        void AssistantTagsPopup.show({ title: '标签管理' })
      }
    })
  }

  return items
}

// 提取创建菜单配置的函数
function getMenuItems({
  assistant,
  allTags,
  assistants,
  updateAssistants,
  copyAssistant,
  onSwitch,
  onDelete,
  removeAllTopics,
  setAssistantIconType,
  sortBy,
  handleSortByChange,
  sortByPinyinAsc,
  sortByPinyinDesc
}): MenuProps['items'] {
  return [
    {
      label: '编辑助手',
      key: 'edit',
      icon: <EditIcon size={14} />,
      onClick: () => AssistantSettingsPopup.show({ assistant })
    },
    {
      label: '复制助手',
      key: 'duplicate',
      icon: <CopyIcon size={14} />,
      onClick: async () => {
        const _assistant = copyAssistant(assistant)
        if (_assistant) {
          onSwitch(_assistant)
        }
      }
    },
    {
      label: '清空话题',
      key: 'clear',
      icon: <BrushCleaning size={14} />,
      onClick: () => {
        window.modal.confirm({
          title: '清空话题',
          content: '清空话题会删除助手下所有话题和文件，确定要继续吗？',
          centered: true,
          okButtonProps: { danger: true },
          onOk: removeAllTopics
        })
      }
    },
    {
      label: '助手图标',
      key: 'icon-type',
      icon: <Smile size={14} />,
      children: [
        {
          label: '模型图标',
          key: 'model',
          onClick: () => setAssistantIconType('model')
        },
        {
          label: 'Emoji 表情',
          key: 'emoji',
          onClick: () => setAssistantIconType('emoji')
        },
        {
          label: '不显示',
          key: 'none',
          onClick: () => setAssistantIconType('none')
        }
      ]
    },
    {
      type: 'divider'
    },
    {
      label: '标签管理',
      key: 'all-tags',
      icon: <Plus size={14} />,
      children: createTagMenuItems(allTags, assistant, assistants, updateAssistants)
    },
    {
      label: sortBy === 'list' ? '标签展示' : '列表展示',
      key: 'switch-view',
      icon: sortBy === 'list' ? <Tags size={14} /> : <AlignJustify size={14} />,
      onClick: () => {
        sortBy === 'list' ? handleSortByChange?.('tags') : handleSortByChange?.('list')
      }
    },
    {
      label: '按拼音升序',
      key: 'sort-asc',
      icon: <ArrowDownAZ size={14} />,
      onClick: sortByPinyinAsc
    },
    {
      label: '按拼音降序',
      key: 'sort-desc',
      icon: <ArrowUpAZ size={14} />,
      onClick: sortByPinyinDesc
    },
    {
      type: 'divider'
    },
    {
      label: '删除',
      key: 'delete',
      icon: <DeleteIcon size={14} className="lucide-custom" />,
      danger: true,
      onClick: () => {
        window.modal.confirm({
          title: '删除助手',
          content: '删除助手会删除所有该助手下的话题和文件，确定要继续吗？',
          centered: true,
          okButtonProps: { danger: true },
          onOk: () => onDelete(assistant)
        })
      }
    }
  ]
}

const Container = ({
  children,
  isActive,
  className,
  ...props
}: PropsWithChildren<{ isActive?: boolean } & React.HTMLAttributes<HTMLDivElement>>) => (
  <div
    {...props}
    className={cn(
      'relative flex h-9.25 w-[calc(var(--assistants-width)-20px)] cursor-pointer flex-row justify-between rounded-(--list-item-border-radius) border-[0.5px] border-transparent px-2',
      !isActive && 'hover:bg-(--color-list-item-hover)',
      isActive && 'bg-(--color-list-item) shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]',
      className
    )}>
    {children}
  </div>
)

const AssistantNameRow = ({
  children,
  className,
  ...props
}: PropsWithChildren<{} & React.HTMLAttributes<HTMLDivElement>>) => (
  <div
    {...props}
    className={cn('flex min-w-0 flex-1 flex-row items-center gap-2 text-(--color-text) text-[13px]', className)}>
    {children}
  </div>
)

const AssistantName = ({
  children,
  className,
  ...props
}: PropsWithChildren<{} & React.HTMLAttributes<HTMLDivElement>>) => (
  <div
    {...props}
    className={cn('min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]', className)}>
    {children}
  </div>
)

const MenuButton = ({
  children,
  className,
  ...props
}: PropsWithChildren<{} & React.HTMLAttributes<HTMLDivElement>>) => (
  <div
    {...props}
    className={cn(
      'absolute top-1.5 right-2.25 flex h-5.5 min-h-5.5 min-w-5.5 flex-row items-center justify-center rounded-[11px] border-(--color-border) border-[0.5px] bg-(--color-background) px-1.25',
      className
    )}>
    {children}
  </div>
)

export default memo(AssistantItem)
