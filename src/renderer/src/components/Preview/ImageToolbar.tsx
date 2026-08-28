import { ResetIcon } from '@renderer/components/Icons'
import { clsx } from 'clsx'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Scan, ZoomIn, ZoomOut } from 'lucide-react'
import { memo, useCallback } from 'react'
import styled from 'styled-components'

import ImageToolButton from './ImageToolButton'

interface ImageToolbarProps {
  pan: (dx: number, dy: number, absolute?: boolean) => void
  zoom: (delta: number, absolute?: boolean) => void
  dialog: () => void
  className?: string
}

const ImageToolbar = ({ pan, zoom, dialog, className }: ImageToolbarProps) => {
  // 定义平移距离
  const panDistance = 20

  // 定义缩放增量
  const zoomDelta = 0.1

  const handleReset = useCallback(() => {
    pan(0, 0, true)
    zoom(1, true)
  }, [pan, zoom])

  return (
    <ToolbarWrapper className={clsx('preview-toolbar', className)} role="toolbar" aria-label={'预览'}>
      {/* Up */}
      <ActionButtonRow>
        <Spacer />
        <ImageToolButton tooltip={'上移'} icon={<ChevronUp size={'1rem'} />} onClick={() => pan(0, -panDistance)} />
        <ImageToolButton tooltip={'打开预览窗口'} icon={<Scan size={'1rem'} />} onClick={dialog} />
      </ActionButtonRow>

      {/* Left, Reset, Right */}
      <ActionButtonRow>
        <ImageToolButton tooltip={'左移'} icon={<ChevronLeft size={'1rem'} />} onClick={() => pan(-panDistance, 0)} />
        <ImageToolButton tooltip={'重置'} icon={<ResetIcon size={'1rem'} />} onClick={handleReset} />
        <ImageToolButton tooltip={'右移'} icon={<ChevronRight size={'1rem'} />} onClick={() => pan(panDistance, 0)} />
      </ActionButtonRow>

      {/* Down, Zoom */}
      <ActionButtonRow>
        <ImageToolButton tooltip={'缩小'} icon={<ZoomOut size={'1rem'} />} onClick={() => zoom(-zoomDelta)} />
        <ImageToolButton tooltip={'下移'} icon={<ChevronDown size={'1rem'} />} onClick={() => pan(0, panDistance)} />
        <ImageToolButton tooltip={'放大'} icon={<ZoomIn size={'1rem'} />} onClick={() => zoom(zoomDelta)} />
      </ActionButtonRow>
    </ToolbarWrapper>
  )
}

const ToolbarWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  position: absolute;
  gap: 4px;
  right: 1em;
  bottom: 1em;
  z-index: 5;

  .ant-btn {
    line-height: 0;
  }
`

const ActionButtonRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 4px;
  width: 100%;
`

const Spacer = styled.div`
  flex: 1;
`

export default memo(ImageToolbar)
