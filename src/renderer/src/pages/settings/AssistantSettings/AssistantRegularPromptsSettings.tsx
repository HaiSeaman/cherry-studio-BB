import { ExclamationCircleOutlined } from '@ant-design/icons'
import { DraggableList } from '@renderer/components/DraggableList'
import FileItem from '@renderer/components/FileItem'
import { DeleteIcon, EditIcon } from '@renderer/components/Icons'
import type { Assistant, QuickPhrase } from '@renderer/types'
import { Button, Flex, Input, Modal, Popconfirm, Space } from 'antd'
import { PlusIcon } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import styled from 'styled-components'

import { SettingDivider, SettingRow, SettingTitle } from '..'

const { TextArea } = Input

interface AssistantRegularPromptsSettingsProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => void
}

const AssistantRegularPromptsSettings: FC<AssistantRegularPromptsSettingsProps> = ({ assistant, updateAssistant }) => {
  const [promptsList, setPromptsList] = useState<QuickPhrase[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<QuickPhrase | null>(null)
  const [formData, setFormData] = useState({ title: '', content: '' })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    setPromptsList(assistant.regularPhrases || [])
  }, [assistant.regularPhrases])

  const handleAdd = () => {
    setEditingPrompt(null)
    setFormData({ title: '', content: '' })
    setIsModalOpen(true)
  }

  const handleEdit = (prompt: QuickPhrase) => {
    setEditingPrompt(prompt)
    setFormData({ title: prompt.title, content: prompt.content })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: string) => {
    const updatedPrompts = promptsList.filter((prompt) => prompt.id !== id)
    setPromptsList(updatedPrompts)
    updateAssistant({ ...assistant, regularPhrases: updatedPrompts })
  }

  const handleModalOk = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      return
    }

    let updatedPrompts: QuickPhrase[]
    if (editingPrompt) {
      updatedPrompts = promptsList.map((prompt) =>
        prompt.id === editingPrompt.id ? { ...prompt, ...formData } : prompt
      )
    } else {
      const newPrompt: QuickPhrase = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...formData
      }
      updatedPrompts = [...promptsList, newPrompt]
    }
    setPromptsList(updatedPrompts)
    updateAssistant({ ...assistant, regularPhrases: updatedPrompts })
    setIsModalOpen(false)
  }

  const handleUpdateOrder = async (newPrompts: QuickPhrase[]) => {
    setPromptsList(newPrompts)
    updateAssistant({ ...assistant, regularPhrases: newPrompts })
  }

  const reversedPrompts = [...promptsList].reverse()

  return (
    <Container>
      <SettingTitle>
        {'常用短语'}
        <Button type="text" icon={<PlusIcon size={18} />} onClick={handleAdd} />
      </SettingTitle>
      <SettingDivider />
      <SettingRow>
        <StyledPromptList>
          <DraggableList
            list={reversedPrompts}
            onUpdate={(newPrompts) => handleUpdateOrder([...newPrompts].reverse())}
            style={{ paddingBottom: dragging ? '34px' : 0 }}
            onDragStart={() => setDragging(true)}
            onDragEnd={() => setDragging(false)}>
            {(prompt) => (
              <FileItem
                key={prompt.id}
                fileInfo={{
                  name: prompt.title,
                  ext: '.txt',
                  extra: prompt.content,
                  actions: (
                    <Flex gap={4} style={{ opacity: 0.6 }}>
                      <Button key="edit" type="text" icon={<EditIcon size={14} />} onClick={() => handleEdit(prompt)} />
                      <Popconfirm
                        title={'删除短语'}
                        description={'确定要删除这个短语吗？'}
                        okText={'确认'}
                        cancelText={'取消'}
                        onConfirm={() => handleDelete(prompt.id)}
                        icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}>
                        <Button
                          key="delete"
                          type="text"
                          danger
                          icon={<DeleteIcon size={14} className="lucide-custom" />}
                        />
                      </Popconfirm>
                    </Flex>
                  )
                }}
              />
            )}
          </DraggableList>
        </StyledPromptList>
      </SettingRow>

      <Modal
        title={editingPrompt ? '编辑短语' : '添加短语'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        width={520}
        transitionName="animation-move-down"
        centered>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Label>{'标题'}</Label>
            <Input
              placeholder={'输入标题'}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
          <div>
            <Label>{'内容'}</Label>
            <TextArea
              placeholder={
                '请输入短语内容，支持使用变量，然后按 Tab 键可以快速定位到变量进行修改。比如：\n帮我规划从 ${from} 到 ${to} 的路线，然后发送到 ${email}'
              }
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
              style={{ resize: 'none' }}
            />
          </div>
        </Space>
      </Modal>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
`

const Label = styled.div`
  font-size: 14px;
  color: var(--color-text);
  margin-bottom: 8px;
`

const StyledPromptList = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export default AssistantRegularPromptsSettings
