import { loggerService } from '@renderer/services/LoggerService'
import type { VideoMessageBlock } from '@renderer/types/newMessage'
import type { FC } from 'react'
import { useRef } from 'react'
import styled from 'styled-components'

const logger = loggerService.withContext('MessageVideo')
interface Props {
  block: VideoMessageBlock
}

const MessageVideo: FC<Props> = ({ block }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  logger.debug(`MessageVideo: ${JSON.stringify(block)}`)

  if (!block.url && !block.filePath) {
    return null
  }

  /**
   * 渲染本地视频文件
   */
  const renderLocalVideo = () => {
    if (!block.filePath) {
      logger.warn('Local video was requested but block.filePath is missing.')
      return <div>{'本地视频文件不存在'}</div>
    }

    const videoSrc = `file://${block.metadata?.video.path}`

    const handleReady = () => {
      const startTime = Math.floor(block.metadata?.startTime ?? 0)
      if (videoRef.current) {
        videoRef.current.currentTime = startTime
      }
    }

    // 原生 <video> 覆盖了此前 react-player 用到的全部能力(src/controls/seek)
    return (
      <video
        ref={videoRef}
        style={{ height: '100%', width: '100%' }}
        src={videoSrc}
        controls
        onLoadedMetadata={handleReady}
      />
    )
  }

  const renderVideo = () => {
    switch (block.metadata?.type) {
      case 'video':
        return renderLocalVideo()

      default:
        if (block.filePath) {
          logger.warn(
            `Unknown video type: ${block.metadata?.type}, but with filePath will try to render as local video.`
          )
          return renderLocalVideo()
        }

        logger.warn(`Unsupported video type: ${block.metadata?.type} or missing necessary data.`)
        return <div>{'不支持的视频格式'}</div>
    }
  }

  return <Container>{renderVideo()}</Container>
}

export default MessageVideo

const Container = styled.div`
  max-width: 560px;
  width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  background-color: #000;
`
