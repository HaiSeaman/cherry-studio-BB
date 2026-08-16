import ImageViewer from '@renderer/components/ImageViewer'
import FileManager from '@renderer/services/FileManager'
import { type ImageMessageBlock, MessageBlockStatus } from '@renderer/types/newMessage'
import { Skeleton } from 'antd'
import React from 'react'
import styled from 'styled-components'

interface Props {
  block: ImageMessageBlock
  isSingle?: boolean
}

const ImageBlock: React.FC<Props> = ({ block, isSingle = false }) => {
  // 远程 URL 图片加载失败（如百炼 OSS 链接 24 小时过期）时给出可读提示
  const [failedSrcs, setFailedSrcs] = React.useState<ReadonlySet<string>>(() => new Set())

  const images = block.metadata?.generateImageResponse?.images
  const imageKey = images?.join(',') ?? block.url ?? block.file?.id ?? ''
  // 图片列表变化时重置失败状态，允许重新尝试加载
  React.useEffect(() => {
    setFailedSrcs(new Set())
  }, [imageKey])

  if (block.status === MessageBlockStatus.PENDING) {
    return <Skeleton.Image active style={{ width: 200, height: 200 }} />
  }

  if (block.status === MessageBlockStatus.STREAMING || block.status === MessageBlockStatus.SUCCESS) {
    const images = block.metadata?.generateImageResponse?.images?.length
      ? block.metadata?.generateImageResponse?.images
      : block?.file
        ? [`file://${FileManager.getFilePath(block?.file)}`]
        : block?.url
          ? [block.url]
          : []

    return (
      <Container>
        {images.map((src, index) =>
          failedSrcs.has(src) ? (
            <ExpiredHint key={`image-${index}`}>
              {src.startsWith('http')
                ? '图片加载失败，链接可能已过期（生成图原始链接有效期约 24 小时）'
                : '图片加载失败，本地文件可能已被清理'}
            </ExpiredHint>
          ) : (
            <ImageViewer
              src={src}
              key={`image-${index}`}
              onError={() => setFailedSrcs((prev) => new Set(prev).add(src))}
              style={
                isSingle
                  ? { maxWidth: 500, maxHeight: 'min(500px, 50vh)', padding: 0, borderRadius: 8 }
                  : { width: 280, height: 280, objectFit: 'cover', padding: 0, borderRadius: 8 }
              }
            />
          )
        )}
      </Container>
    )
  }

  return null
}

const Container = styled.div`
  display: block;
`

const ExpiredHint = styled.div`
  display: flex;
  align-items: center;
  width: 280px;
  height: 120px;
  padding: 12px;
  border-radius: 8px;
  border: 0.5px dashed var(--color-border);
  color: var(--color-text-3);
  font-size: 12px;
  background-color: var(--color-background-soft);
  word-break: break-word;
`
export default React.memo(ImageBlock)
