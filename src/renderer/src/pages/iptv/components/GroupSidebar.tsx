import { Clock, Heart, LayoutGrid, ListVideo } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import styled, { css } from 'styled-components'

import { groupByChannels } from '../services/channelService'
import type { IptvChannel } from '../types'

/** 固定分组 id（动态分组用 group 名本身） */
export type GroupKey = '__all__' | '__favorites__' | '__recent__' | string

interface GroupSidebarProps {
  channels: IptvChannel[]
  current: GroupKey
  onSelect: (group: GroupKey) => void
  favoriteCount: number
  recentCount: number
}

const Count = styled.span`
  flex: none;
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  padding: 0 7px;
  border-radius: 9px;
  color: var(--color-text-3);
  background: var(--color-background-mute);
`

const GroupItem = styled.div<{ $active: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  color: var(--color-text-2);
  transition:
    background 0.15s,
    color 0.15s;

  > svg {
    flex: none;
    opacity: 0.7;
  }

  > span:first-of-type {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: var(--color-list-item-hover);
    color: var(--color-text);

    > svg {
      opacity: 1;
    }
  }

  ${(p) =>
    p.$active &&
    css`
      background: var(--color-primary-mute);
      color: var(--color-primary);
      font-weight: 600;

      > svg {
        opacity: 1;
      }

      &::before {
        content: '';
        position: absolute;
        left: 0;
        top: 22%;
        bottom: 22%;
        width: 3px;
        border-radius: 2px;
        background: var(--color-primary);
      }

      ${Count} {
        color: var(--color-primary);
        background: transparent;
      }
    `}
`

const FIXED_GROUPS: { key: GroupKey; label: string; icon: ReactNode }[] = [
  { key: '__all__', label: '全部频道', icon: <LayoutGrid size={14} /> },
  { key: '__favorites__', label: '我的收藏', icon: <Heart size={14} /> },
  { key: '__recent__', label: '最近观看', icon: <Clock size={14} /> }
]

export const GroupSidebar: FC<GroupSidebarProps> = ({ channels, current, onSelect, favoriteCount, recentCount }) => {
  const dynamic = groupByChannels(channels)

  return (
    <Container>
      {FIXED_GROUPS.map((g) => (
        <GroupItem key={g.key} $active={current === g.key} onClick={() => onSelect(g.key)}>
          {g.icon}
          <span>{g.label}</span>
          <Count>
            {g.key === '__all__' ? channels.length : g.key === '__favorites__' ? favoriteCount : recentCount}
          </Count>
        </GroupItem>
      ))}
      <Divider />
      {dynamic.map((g) => (
        <GroupItem key={g.name} title={g.name} $active={current === g.name} onClick={() => onSelect(g.name)}>
          <ListVideo size={14} />
          <span>{g.name}</span>
          <Count>{g.count}</Count>
        </GroupItem>
      ))}
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
`

const Divider = styled.div`
  height: 1px;
  margin: 8px 6px;
  background: var(--color-border-soft);
`
