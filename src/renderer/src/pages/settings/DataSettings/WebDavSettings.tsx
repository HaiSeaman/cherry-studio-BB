import { FolderOpenOutlined, SaveOutlined } from '@ant-design/icons'
import { useWebdavBackupModal, WebdavBackupManager, WebdavBackupModal } from '@renderer/components/BackupManager'
import { HStack } from '@renderer/components/Layout'
import Selector from '@renderer/components/Selector'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { startAutoSync, stopAutoSync } from '@renderer/services/BackupService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  setWebdavAllowSelfSignedCertificate as _setWebdavAllowSelfSignedCertificate,
  setWebdavAutoSync,
  setWebdavDisableStream as _setWebdavDisableStream,
  setWebdavHost as _setWebdavHost,
  setWebdavMaxBackups as _setWebdavMaxBackups,
  setWebdavPass as _setWebdavPass,
  setWebdavPath as _setWebdavPath,
  setWebdavSkipBackupFile as _setWebdavSkipBackupFile,
  setWebdavSyncInterval as _setWebdavSyncInterval,
  setWebdavUser as _setWebdavUser
} from '@renderer/store/settings'
import { Button, Input, Switch } from 'antd'
import type { FC } from 'react'
import { useState } from 'react'

import { SettingDivider, SettingGroup, SettingHelpText, SettingRow, SettingRowTitle, SettingTitle } from '..'
import { SyncStatus } from './SyncStatus'

const WebDavSettings: FC = () => {
  const {
    webdavHost: webDAVHost,
    webdavUser: webDAVUser,
    webdavPass: webDAVPass,
    webdavPath: webDAVPath,
    webdavSyncInterval: webDAVSyncInterval,
    webdavMaxBackups: webDAVMaxBackups,
    webdavSkipBackupFile: webdDAVSkipBackupFile,
    webdavDisableStream: webDAVDisableStream,
    webdavAllowSelfSignedCertificate: webDAVAllowSelfSignedCertificate
  } = useSettings()

  const [webdavHost, setWebdavHost] = useState<string | undefined>(webDAVHost)
  const [webdavUser, setWebdavUser] = useState<string | undefined>(webDAVUser)
  const [webdavPass, setWebdavPass] = useState<string | undefined>(webDAVPass)
  const [webdavPath, setWebdavPath] = useState<string | undefined>(webDAVPath)
  const [webdavSkipBackupFile, setWebdavSkipBackupFile] = useState<boolean>(webdDAVSkipBackupFile)
  const [webdavDisableStream, setWebdavDisableStream] = useState<boolean>(webDAVDisableStream)
  const [webdavAllowSelfSignedCertificate, setWebdavAllowSelfSignedCertificate] = useState<boolean>(
    webDAVAllowSelfSignedCertificate
  )
  const [backupManagerVisible, setBackupManagerVisible] = useState(false)

  const [syncInterval, setSyncInterval] = useState<number>(webDAVSyncInterval)
  const [maxBackups, setMaxBackups] = useState<number>(webDAVMaxBackups)

  const dispatch = useAppDispatch()
  const { theme } = useTheme()

  const { webdavSync } = useAppSelector((state) => state.backup)

  // 把之前备份的文件定时上传到 webdav，首先先配置 webdav 的 host, port, user, pass, path

  const onSyncIntervalChange = (value: number) => {
    setSyncInterval(value)
    dispatch(_setWebdavSyncInterval(value))
    if (value === 0) {
      dispatch(setWebdavAutoSync(false))
      stopAutoSync('webdav')
    } else {
      dispatch(setWebdavAutoSync(true))
      startAutoSync(false, 'webdav')
    }
  }

  const onMaxBackupsChange = (value: number) => {
    setMaxBackups(value)
    dispatch(_setWebdavMaxBackups(value))
  }

  const onSkipBackupFilesChange = (value: boolean) => {
    setWebdavSkipBackupFile(value)
    dispatch(_setWebdavSkipBackupFile(value))
  }

  const onDisableStreamChange = (value: boolean) => {
    setWebdavDisableStream(value)
    dispatch(_setWebdavDisableStream(value))
  }

  const renderSyncStatus = () => {
    if (!webdavHost) return null
    return <SyncStatus sync={webdavSync} emptyLabel="等待下次备份" syncedLabel="上次备份时间: " errorLabel="备份错误" />
  }

  const { isModalVisible, handleBackup, handleCancel, backuping, customFileName, setCustomFileName, showBackupModal } =
    useWebdavBackupModal()

  const showBackupManager = () => {
    setBackupManagerVisible(true)
  }

  const closeBackupManager = () => {
    setBackupManagerVisible(false)
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle>{'WebDAV'}</SettingTitle>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'WebDAV 地址'}</SettingRowTitle>
        <Input
          placeholder={'http://localhost:8080'}
          value={webdavHost}
          onChange={(e) => setWebdavHost(e.target.value)}
          style={{ width: 250 }}
          type="url"
          onBlur={() => dispatch(_setWebdavHost(webdavHost || ''))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'WebDAV 用户名'}</SettingRowTitle>
        <Input
          placeholder={'WebDAV 用户名'}
          value={webdavUser}
          onChange={(e) => setWebdavUser(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(_setWebdavUser(webdavUser || ''))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'WebDAV 密码'}</SettingRowTitle>
        <Input.Password
          placeholder={'WebDAV 密码'}
          value={webdavPass}
          onChange={(e) => setWebdavPass(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(_setWebdavPass(webdavPass || ''))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'WebDAV 路径'}</SettingRowTitle>
        <Input
          placeholder={'/backup'}
          value={webdavPath}
          onChange={(e) => setWebdavPath(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(_setWebdavPath(webdavPath || ''))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'允许自签名证书'}</SettingRowTitle>
        <Switch
          checked={webdavAllowSelfSignedCertificate}
          onChange={(checked) => {
            setWebdavAllowSelfSignedCertificate(checked)
            dispatch(_setWebdavAllowSelfSignedCertificate(checked))
          }}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'数据备份与恢复'}</SettingRowTitle>
        <HStack gap="5px" justifyContent="space-between">
          <Button onClick={showBackupModal} icon={<SaveOutlined />} loading={backuping}>
            {'备份到 WebDAV'}
          </Button>
          <Button onClick={showBackupManager} icon={<FolderOpenOutlined />} disabled={!webdavHost}>
            {'从 WebDAV 恢复'}
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
          disabled={!webdavHost}
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
          disabled={!webdavHost}
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
        <Switch checked={webdavSkipBackupFile} onChange={onSkipBackupFilesChange} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>
          {'备份时跳过备份图片、知识库等数据文件，仅备份聊天记录和设置。减少空间占用，加快备份速度'}
        </SettingHelpText>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'禁用流式上传'}</SettingRowTitle>
        <Switch checked={webdavDisableStream} onChange={onDisableStreamChange} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>
          {'开启后，将文件加载到内存中再上传，可解决部分WebDAV服务不兼容chunked上传的问题，但会增加内存占用。'}
        </SettingHelpText>
      </SettingRow>
      {webdavSync && syncInterval > 0 && (
        <>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{'备份状态'}</SettingRowTitle>
            {renderSyncStatus()}
          </SettingRow>
        </>
      )}
      <>
        <WebdavBackupModal
          isModalVisible={isModalVisible}
          handleBackup={handleBackup}
          handleCancel={handleCancel}
          backuping={backuping}
          customFileName={customFileName}
          setCustomFileName={setCustomFileName}
        />

        <WebdavBackupManager
          visible={backupManagerVisible}
          onClose={closeBackupManager}
          webdavConfig={{
            webdavHost,
            webdavUser,
            webdavPass,
            webdavPath,
            webdavDisableStream
          }}
        />
      </>
    </SettingGroup>
  )
}

export default WebDavSettings
