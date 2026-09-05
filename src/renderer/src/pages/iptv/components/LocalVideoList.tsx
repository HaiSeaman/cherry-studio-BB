import { DynamicVirtualList } from '@renderer/components/VirtualList'
import { Film, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import styled from 'styled-components'

import { formatTime, hasResumePoint, localFileUrl } from '../services/localMediaService'
import type { IptvLocalVideo } from '../types'

interface LocalVideoListProps {
  videos: IptvLocalVideo[]
  /** 当前播放中的本地视频 file:// url（高亮用） */
  currentUrl: string | null
  onPlay: (v: IptvLocalVideo) => void
  onRemove: (v: IptvLocalVideo) => void
}

export const LocalVideoList: FC<LocalVideoListProps> = ({ videos, currentUrl, onPlay, onRemove }) => (
  <ListWrap>
    <DynamicVirtualList
      list={videos}
      estimateSize={() => 50}
      children={(v) => (
        <LocalItem
          key={v.id}
          $active={localFileUrl(v.path) === currentUrl}
          onClick={() => onPlay(v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onPlay(v)
          }}>
          <FilmIconBox>
            <Film size={16} />
          </FilmIconBox>
          <Meta>
            <Name title={v.name}>{v.name}</Name>
            <Sub>{subTitle(v)}</Sub>
          </Meta>
          <DelButton
            onClick={(e) => {
              e.stopPropagation()
              onRemove(v)
            }}
            aria-label={`移除 ${v.name}`}
            title="从列表移除（不删除文件）">
            <Trash2 size={14} />
          </DelButton>
        </LocalItem>
      )}
    />
  </ListWrap>
)

/** 断点/时长副标题：有断点显示"进度 · 时长"，无则只显示时长 */
function subTitle(v: IptvLocalVideo): string {
  const dur = v.durationSec > 0 ? formatTime(v.durationSec) : '未播放'
  if (v.durationSec > 0 && hasResumePoint(v.positionSec, v.durationSec)) {
    return `已看 ${formatTime(v.positionSec)} / ${dur}`
  }
  return dur
}

const ListWrap = styled.div`
  height: 100%;
  padding: 6px 8px;
  box-sizing: border-box;
`

const LocalItem = styled.div<{ $active: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--color-list-item-hover);

    .del-btn {
      opacity: 1;
    }
  }

  ${(p) =>
    p.$active &&
    `
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

const FilmIconBox = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: rgba(127, 127, 127, 0.14);
  color: var(--color-text-2);
`

const Meta = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const Name = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text);
`

const Sub = styled.span`
  font-size: 11px;
  color: var(--color-text-3);
  font-variant-numeric: tabular-nums;
`

const DelButton = styled.button`
  flex: none;
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  color: var(--color-text-3);
  opacity: 0;
  transition:
    opacity 0.15s,
    color 0.15s;

  &:hover {
    color: var(--color-error, #e5484d);
    background: var(--color-background-mute);
  }
`
