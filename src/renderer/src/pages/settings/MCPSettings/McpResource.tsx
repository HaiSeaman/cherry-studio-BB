import type { MCPResource } from '@renderer/types'
import { Collapse, Descriptions, Empty, Flex, Tag, Typography } from 'antd'
import styled from 'styled-components'

interface MCPResourcesSectionProps {
  resources: MCPResource[]
}

const MCPResourcesSection = ({ resources }: MCPResourcesSectionProps) => {
  // Format file size to human-readable format
  const formatFileSize = (size?: number) => {
    if (size === undefined) return 'Unknown size'

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let formattedSize = size
    let unitIndex = 0

    while (formattedSize >= 1024 && unitIndex < units.length - 1) {
      formattedSize /= 1024
      unitIndex++
    }

    return `${formattedSize.toFixed(2)} ${units[unitIndex]}`
  }

  // Render resource properties
  const renderResourceProperties = (resource: MCPResource) => {
    return (
      <Descriptions column={1} size="small" bordered>
        {resource.mimeType && (
          <Descriptions.Item label={'MIME 类型'}>
            <Tag color="blue">{resource.mimeType}</Tag>
          </Descriptions.Item>
        )}
        {resource.size !== undefined && (
          <Descriptions.Item label={'大小'}>{formatFileSize(resource.size)}</Descriptions.Item>
        )}
        {resource.text && <Descriptions.Item label={'文本'}>{resource.text}</Descriptions.Item>}
        {resource.blob && <Descriptions.Item label={'二进制数据'}>{'隐藏二进制数据'}</Descriptions.Item>}
      </Descriptions>
    )
  }

  return (
    <Section>
      <SectionTitle>{'可用资源'}</SectionTitle>
      {resources.length > 0 ? (
        <Collapse bordered={false} ghost>
          {resources.map((resource) => (
            <Collapse.Panel
              key={resource.uri}
              header={
                <Flex vertical align="flex-start" style={{ width: '100%' }}>
                  <Flex align="center" style={{ width: '100%' }}>
                    <Typography.Text strong>{`${resource.name} (${resource.uri})`}</Typography.Text>
                  </Flex>
                  {resource.description && (
                    <Typography.Text type="secondary" style={{ fontSize: '13px', marginTop: 4 }}>
                      {resource.description.length > 100
                        ? `${resource.description.substring(0, 100)}...`
                        : resource.description}
                    </Typography.Text>
                  )}
                </Flex>
              }>
              <SelectableContent>{renderResourceProperties(resource)}</SelectableContent>
            </Collapse.Panel>
          ))}
        </Collapse>
      ) : (
        <Empty description={'无可用资源'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Section>
  )
}

const Section = styled.div`
  margin-top: 8px;
  padding-top: 8px;
`

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--color-text-secondary);
`

const SelectableContent = styled.div`
  user-select: text;
  padding: 0 12px;
`

export default MCPResourcesSection
