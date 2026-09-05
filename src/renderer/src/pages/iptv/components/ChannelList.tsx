import { DynamicVirtualList } from '@renderer/components/VirtualList'
import type { FC } from 'react'
import styled from 'styled-components'

import type { IptvChannel } from '../types'
import { ChannelItem } from './ChannelItem'

interface ChannelListProps {
  channels: IptvChannel[]
  currentUrl: string | null
  favoriteUrls: Set<string>
  onPlay: (channel: IptvChannel) => void
  onToggleFavorite: (channel: IptvChannel) => void
}

export const ChannelList: FC<ChannelListProps> = ({ channels, currentUrl, favoriteUrls, onPlay, onToggleFavorite }) => (
  <ListWrap>
    <DynamicVirtualList
      list={channels}
      estimateSize={() => 44}
      children={(channel) => (
        <ChannelItem
          channel={channel}
          active={channel.url === currentUrl}
          favorite={favoriteUrls.has(channel.url)}
          onPlay={onPlay}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    />
  </ListWrap>
)

const ListWrap = styled.div`
  height: 100%;
  padding: 6px 8px;
  box-sizing: border-box;
`
