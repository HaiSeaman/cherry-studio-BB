import { getBackupProgressLabel, getRestoreProgressLabel } from '@renderer/i18n/label'
import { backup, restore } from '@renderer/services/BackupService'
import store from '@renderer/store'
import { IpcChannel } from '@shared/IpcChannel'
import { Modal, Progress } from 'antd'
import { useEffect, useState } from 'react'

import { TopView } from '../TopView'

interface ProgressData {
  stage: string
  progress: number
  total: number
}

type BackupAction = 'backup' | 'restore'

const ACTION_CONFIG: Record<BackupAction, { title: string; okText: string; intro: string }> = {
  backup: {
    title: '数据备份',
    okText: '选择备份位置',
    intro: '备份全部数据，包括聊天记录、设置、知识库等所有数据。请注意，备份过程可能需要一些时间，感谢您的耐心等待'
  },
  restore: {
    title: '数据恢复',
    okText: '选择备份文件',
    intro: '恢复操作将使用备份数据覆盖当前所有应用数据。请注意，恢复过程可能需要一些时间，感谢您的耐心等待'
  }
}

const getLabel = (action: BackupAction) => (action === 'backup' ? getBackupProgressLabel : getRestoreProgressLabel)
const getChannel = (action: BackupAction) =>
  action === 'backup' ? IpcChannel.BackupProgress : IpcChannel.RestoreProgress

interface Props {
  action: BackupAction
  resolve: (data: any) => void
}

const PopupContainer: React.FC<Props> = ({ action, resolve }) => {
  const [open, setOpen] = useState(true)
  const [progressData, setProgressData] = useState<ProgressData>()
  const skipBackupFile = store.getState().settings.skipBackupFile
  const { title, okText, intro } = ACTION_CONFIG[action]

  useEffect(() => {
    const removeListener = window.electron.ipcRenderer.on(getChannel(action), (_, data: ProgressData) => {
      setProgressData(data)
    })

    return () => {
      removeListener()
    }
  }, [action])

  const onOk = async () => {
    if (action === 'backup') {
      await backup(skipBackupFile)
    } else {
      await restore()
    }
    setOpen(false)
  }

  const onCancel = () => {
    setOpen(false)
  }

  const onClose = () => {
    resolve({})
  }

  const getProgressText = () => {
    if (!progressData) return ''
    if (progressData.stage === 'copying_files') {
      return `复制文件... ${Math.floor(progressData.progress)}%`
    }
    return getLabel(action)(progressData.stage)
  }

  BackupRestorePopup.hide = onCancel

  const isDisabled = progressData ? progressData.stage !== 'completed' : false

  return (
    <Modal
      title={title}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      afterClose={onClose}
      okButtonProps={{ disabled: isDisabled }}
      cancelButtonProps={{ disabled: isDisabled }}
      okText={okText}
      maskClosable={false}
      transitionName="animation-move-down"
      centered>
      {!progressData && <div>{intro}</div>}
      {progressData && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <Progress percent={Math.floor(progressData.progress)} strokeColor="var(--color-primary)" />
          <div style={{ marginTop: 16 }}>{getProgressText()}</div>
        </div>
      )}
    </Modal>
  )
}

const TopViewKey = 'BackupRestorePopup'

export default class BackupRestorePopup {
  static hide() {
    TopView.hide(TopViewKey)
  }
  static show(action: BackupAction) {
    return new Promise<any>((resolve) => {
      TopView.show(
        <PopupContainer
          action={action}
          resolve={(v) => {
            resolve(v)
            TopView.hide(TopViewKey)
          }}
        />,
        TopViewKey
      )
    })
  }
}
