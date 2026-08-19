import { DeleteOutlined, FolderOpenOutlined, SaveOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { LocalBackupManager, LocalBackupModal, useLocalBackupModal } from '@renderer/components/BackupManager'
import { HStack } from '@renderer/components/Layout'
import Selector from '@renderer/components/Selector'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { startAutoSync, stopAutoSync } from '@renderer/services/BackupService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  setLocalBackupAutoSync,
  setLocalBackupDir as _setLocalBackupDir,
  setLocalBackupMaxBackups as _setLocalBackupMaxBackups,
  setLocalBackupSkipBackupFile as _setLocalBackupSkipBackupFile,
  setLocalBackupSyncInterval as _setLocalBackupSyncInterval
} from '@renderer/store/settings'
import type { AppInfo } from '@renderer/types'
import { Button, Input, Switch } from 'antd'
import { useEffect, useState } from 'react'

import { SettingDivider, SettingGroup, SettingHelpText, SettingRow, SettingRowTitle, SettingTitle } from '..'
import { SyncStatus } from './SyncStatus'

const logger = loggerService.withContext('LocalBackupSettings')

const LocalBackupSettings: React.FC = () => {
  const dispatch = useAppDispatch()

  const {
    localBackupDir: localBackupDirSetting,
    localBackupSyncInterval: localBackupSyncIntervalSetting,
    localBackupMaxBackups: localBackupMaxBackupsSetting,
    localBackupSkipBackupFile: localBackupSkipBackupFileSetting
  } = useSettings()

  const [localBackupDir, setLocalBackupDir] = useState<string | undefined>(localBackupDirSetting)
  const [resolvedLocalBackupDir, setResolvedLocalBackupDir] = useState<string | undefined>(undefined)
  const [localBackupSkipBackupFile, setLocalBackupSkipBackupFile] = useState<boolean>(localBackupSkipBackupFileSetting)
  const [backupManagerVisible, setBackupManagerVisible] = useState(false)

  const [syncInterval, setSyncInterval] = useState<number>(localBackupSyncIntervalSetting)
  const [maxBackups, setMaxBackups] = useState<number>(localBackupMaxBackupsSetting)

  const [appInfo, setAppInfo] = useState<AppInfo>()

  useEffect(() => {
    void window.api.getAppInfo().then(setAppInfo)
  }, [])

  useEffect(() => {
    if (localBackupDirSetting) {
      void window.api.resolvePath(localBackupDirSetting).then(setResolvedLocalBackupDir)
    }
  }, [localBackupDirSetting])

  const { theme } = useTheme()

  const { localBackupSync } = useAppSelector((state) => state.backup)

  const onSyncIntervalChange = (value: number) => {
    setSyncInterval(value)
    dispatch(_setLocalBackupSyncInterval(value))
    if (value === 0) {
      dispatch(setLocalBackupAutoSync(false))
      stopAutoSync('local')
    } else {
      dispatch(setLocalBackupAutoSync(true))
      startAutoSync(false, 'local')
    }
  }

  const checkLocalBackupDirValid = async (dir: string) => {
    if (dir === '') {
      return false
    }

    const resolvedDir = await window.api.resolvePath(dir)

    // check new local backup dir is not in app data path
    // if is in app data path, show error
    if (await window.api.isPathInside(resolvedDir, appInfo!.appDataPath)) {
      window.toast.error('新路径不能与应用数据路径相同')
      return false
    }

    // check new local backup dir is not in app install path
    // if is in app install path, show error
    if (await window.api.isPathInside(resolvedDir, appInfo!.installPath)) {
      window.toast.error('新路径不能与应用安装路径相同')
      return false
    }

    // check new app data path has write permission
    const hasWritePermission = await window.api.hasWritePermission(resolvedDir)
    if (!hasWritePermission) {
      window.toast.error('新路径没有写入权限')
      return false
    }

    return true
  }

  const handleLocalBackupDirChange = async (value: string) => {
    if (value === localBackupDirSetting) {
      return
    }

    if (value === '') {
      handleClearDirectory()
      return
    }

    if (await checkLocalBackupDirValid(value)) {
      setLocalBackupDir(value)
      dispatch(_setLocalBackupDir(value))
      setResolvedLocalBackupDir(await window.api.resolvePath(value))

      dispatch(setLocalBackupAutoSync(true))
      startAutoSync(true, 'local')
      return
    }

    if (localBackupDirSetting) {
      setLocalBackupDir(localBackupDirSetting)
      return
    }
  }

  const onMaxBackupsChange = (value: number) => {
    setMaxBackups(value)
    dispatch(_setLocalBackupMaxBackups(value))
  }

  const onSkipBackupFilesChange = (value: boolean) => {
    setLocalBackupSkipBackupFile(value)
    dispatch(_setLocalBackupSkipBackupFile(value))
  }

  const handleBrowseDirectory = async () => {
    try {
      const newLocalBackupDir = await window.api.select({
        properties: ['openDirectory', 'createDirectory'],
        title: '选择备份目录'
      })

      if (!newLocalBackupDir) {
        return
      }

      await handleLocalBackupDirChange(newLocalBackupDir)
    } catch (error) {
      logger.error('Failed to select directory:', error as Error)
    }
  }

  const handleClearDirectory = () => {
    setLocalBackupDir('')
    dispatch(_setLocalBackupDir(''))
    dispatch(setLocalBackupAutoSync(false))
    stopAutoSync('local')
  }

  const renderSyncStatus = () => {
    if (!localBackupDir) return null
    return (
      <SyncStatus sync={localBackupSync} emptyLabel="等待下次备份" syncedLabel="上次备份: " errorLabel="备份错误" />
    )
  }

  const { isModalVisible, handleBackup, handleCancel, backuping, customFileName, setCustomFileName, showBackupModal } =
    useLocalBackupModal(resolvedLocalBackupDir)

  const showBackupManager = () => {
    setBackupManagerVisible(true)
  }

  const closeBackupManager = () => {
    setBackupManagerVisible(false)
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle>{'本地备份'}</SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'备份目录'}</SettingRowTitle>
        <HStack gap="5px">
          <Input
            value={localBackupDir}
            onChange={(e) => setLocalBackupDir(e.target.value)}
            onBlur={(e) => handleLocalBackupDirChange(e.target.value)}
            placeholder={'请选择备份目录'}
            style={{ minWidth: 200, maxWidth: 400, flex: 1 }}
          />
          <Button icon={<FolderOpenOutlined />} onClick={handleBrowseDirectory}>
            {'浏览'}
          </Button>
          <Button icon={<DeleteOutlined />} onClick={handleClearDirectory} disabled={!localBackupDir} danger>
            {'清除'}
          </Button>
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'数据备份与恢复'}</SettingRowTitle>
        <HStack gap="5px" justifyContent="space-between">
          <Button onClick={showBackupModal} icon={<SaveOutlined />} loading={backuping} disabled={!localBackupDir}>
            {'本地备份'}
          </Button>
          <Button onClick={showBackupManager} icon={<FolderOpenOutlined />} disabled={!localBackupDir}>
            {'备份文件管理'}
          </Button>
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'自动备份'}</SettingRowTitle>
        <Selector
          size={14}
          value={syncInterval}
          onChange={onSyncIntervalChange}
          disabled={!localBackupDir}
          options={[
            { label: '关闭', value: 0 },
            { label: '1 分钟', value: 1 },
            { label: '5 分钟', value: 5 },
            { label: '15 分钟', value: 15 },
            { label: '30 分钟', value: 30 },
            { label: '1 小时', value: 60 },
            { label: '2 小时', value: 120 },
            { label: '6 小时', value: 360 },
            { label: '12 小时', value: 720 },
            { label: '24 小时', value: 1440 }
          ]}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'最大备份数'}</SettingRowTitle>
        <Selector
          size={14}
          value={maxBackups}
          onChange={onMaxBackupsChange}
          disabled={!localBackupDir}
          options={[
            { label: '无限制', value: 0 },
            { label: '1', value: 1 },
            { label: '3', value: 3 },
            { label: '5', value: 5 },
            { label: '10', value: 10 },
            { label: '20', value: 20 },
            { label: '50', value: 50 }
          ]}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'精简备份'}</SettingRowTitle>
        <Switch checked={localBackupSkipBackupFile} onChange={onSkipBackupFilesChange} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>
          {'备份时跳过备份图片、知识库等数据文件，仅备份聊天记录和设置。减少空间占用，加快备份速度'}
        </SettingHelpText>
      </SettingRow>
      {localBackupSync && syncInterval > 0 && (
        <>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{'备份状态'}</SettingRowTitle>
            {renderSyncStatus()}
          </SettingRow>
        </>
      )}
      <>
        <LocalBackupModal
          isModalVisible={isModalVisible}
          handleBackup={handleBackup}
          handleCancel={handleCancel}
          backuping={backuping}
          customFileName={customFileName}
          setCustomFileName={setCustomFileName}
        />

        <LocalBackupManager
          visible={backupManagerVisible}
          onClose={closeBackupManager}
          localBackupDir={resolvedLocalBackupDir}
        />
      </>
    </SettingGroup>
  )
}

export default LocalBackupSettings
