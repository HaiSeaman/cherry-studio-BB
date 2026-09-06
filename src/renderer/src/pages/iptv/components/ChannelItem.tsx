import { Star } from 'lucide-react'
import type { FC } from 'react'
import styled, { css } from 'styled-components'

import type { IptvChannel } from '../types'
import { Logo } from './Logo'

interface ChannelItemProps {
  channel: IptvChannel
  active: boolean
  favorite: boolean
  onPlay: (channel: IptvChannel) => void
  onToggleFavorite: (channel: IptvChannel) => void
}

export const ChannelItem: FC<ChannelItemProps> = ({ channel, active, favorite, onPlay, onToggleFavorite }) => (
  <Item
    $active={active}
    onClick={() => onPlay(channel)}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === 'Enter') onPlay(channel)
    }}>
    <Logo name={channel.name} logo={channel.logo} size={30} />
    <Name title={channel.name}>{channel.name}</Name>
    <FavButton
      $active={favorite}
      onClick={(e) => {
        e.stopPropagation()
        onToggleFavorite(channel)
      }}
      aria-label={favorite ? '取消收藏' : '收藏'}>
      <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
    </FavButton>
  </Item>
)

const Item = styled.div<{ $active: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-list-item-hover);
  }

  ${(p) =>
    p.$active &&
    css`
      background: var(--color-primary-mute);

      &::before {
        content: '';
        position: absolute;
        left: -1px;
        top: 24%;
        bottom: 24%;
        width: 3px;
        border-radius: 2px;
        background: var(--color-primary);
      }
    `}
`

const Name = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text);
`

const FavButton = styled.button<{ $active: boolean }>`
  flex: none;
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  color: ${(p) => (p.$active ? '#f5a623' : 'var(--color-text-3)')};
  opacity: ${(p) => (p.$active ? 1 : 0.45)};
  transition:
    opacity 0.15s,
    color 0.15s;

  &:hover {
    opacity: 1;
    background: var(--color-background-mute);
  }
`
