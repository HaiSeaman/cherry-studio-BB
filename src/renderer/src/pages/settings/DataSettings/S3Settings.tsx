import { FolderOpenOutlined, InfoCircleOutlined, SaveOutlined } from '@ant-design/icons'
import { S3BackupManager, S3BackupModal, useS3BackupModal } from '@renderer/components/BackupManager'
import { HStack } from '@renderer/components/Layout'
import Selector from '@renderer/components/Selector'
import { AppLogo } from '@renderer/config/env'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useMinappPopup } from '@renderer/hooks/useMinappPopup'
import { useSettings } from '@renderer/hooks/useSettings'
import { startAutoSync, stopAutoSync } from '@renderer/services/BackupService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setS3Partial } from '@renderer/store/settings'
import type { S3Config } from '@renderer/types'
import { Button, Input, Switch, Tooltip } from 'antd'
import type { FC } from 'react'
import { useEffect, useState } from 'react'

import { SettingDivider, SettingGroup, SettingHelpText, SettingRow, SettingRowTitle, SettingTitle } from '..'
import { BACKUP_MAX_KEEP_OPTIONS, BACKUP_SYNC_INTERVAL_OPTIONS } from './backupOptions'
import { SyncStatus } from './SyncStatus'

const S3Settings: FC = () => {
  const { s3 = {} as S3Config } = useSettings()

  const {
    endpoint: s3EndpointInit = '',
    region: s3RegionInit = '',
    bucket: s3BucketInit = '',
    accessKeyId: s3AccessKeyIdInit = '',
    secretAccessKey: s3SecretAccessKeyInit = '',
    root: s3RootInit = '',
    syncInterval: s3SyncIntervalInit = 0,
    maxBackups: s3MaxBackupsInit = 5,
    skipBackupFile: s3SkipBackupFileInit = false
  } = s3

  const [endpoint, setEndpoint] = useState<string | undefined>(s3EndpointInit)
  const [region, setRegion] = useState<string | undefined>(s3RegionInit)
  const [bucket, setBucket] = useState<string | undefined>(s3BucketInit)
  const [accessKeyId, setAccessKeyId] = useState<string | undefined>(s3AccessKeyIdInit)
  const [secretAccessKey, setSecretAccessKey] = useState<string | undefined>(s3SecretAccessKeyInit)
  const [root, setRoot] = useState<string | undefined>(s3RootInit)
  const [skipBackupFile, setSkipBackupFile] = useState<boolean>(s3SkipBackupFileInit)
  const [backupManagerVisible, setBackupManagerVisible] = useState(false)

  const [syncInterval, setSyncInterval] = useState<number>(s3SyncIntervalInit)
  const [maxBackups, setMaxBackups] = useState<number>(s3MaxBackupsInit)

  // 外部状态变化时（如另一窗口修改、云同步覆盖、重置默认），同步回填本地副本，避免表单与 store 永久漂移
  useEffect(() => {
    setEndpoint(s3.endpoint)
    setRegion(s3.region)
    setBucket(s3.bucket)
    setAccessKeyId(s3.accessKeyId)
    setSecretAccessKey(s3.secretAccessKey)
    setRoot(s3.root)
    setSkipBackupFile(s3.skipBackupFile ?? false)
    setSyncInterval(s3.syncInterval ?? 0)
    setMaxBackups(s3.maxBackups ?? 5)
  }, [s3])

  const dispatch = useAppDispatch()
  const { theme } = useTheme()
  const { openSmartMinapp } = useMinappPopup()

  const { s3Sync } = useAppSelector((state) => state.backup)

  const onSyncIntervalChange = (value: number) => {
    setSyncInterval(value)
    dispatch(setS3Partial({ syncInterval: value, autoSync: value !== 0 }))
    if (value === 0) {
      stopAutoSync('s3')
    } else {
      startAutoSync(false, 's3')
    }
  }

  const handleTitleClick = () => {
    openSmartMinapp({
      id: 's3-help',
      name: 'S3 Compatible Storage Help',
      url: 'https://docs.cherry-ai.com/data-settings/s3-compatible',
      logo: AppLogo
    })
  }

  const onMaxBackupsChange = (value: number) => {
    setMaxBackups(value)
    dispatch(setS3Partial({ maxBackups: value }))
  }

  const onSkipBackupFilesChange = (value: boolean) => {
    setSkipBackupFile(value)
    dispatch(setS3Partial({ skipBackupFile: value }))
  }

  const renderSyncStatus = () => {
    if (!endpoint) return null
    return <SyncStatus sync={s3Sync} emptyLabel="未同步" syncedLabel="上次同步: " errorLabel="同步错误" />
  }

  const { isModalVisible, handleBackup, handleCancel, backuping, customFileName, setCustomFileName, showBackupModal } =
    useS3BackupModal()

  const showBackupManager = () => {
    setBackupManagerVisible(true)
  }

  const closeBackupManager = () => {
    setBackupManagerVisible(false)
  }

  return (
    <SettingGroup theme={theme}>
      <SettingTitle style={{ justifyContent: 'flex-start', gap: 10 }}>
        {'S3 兼容存储'}
        <Tooltip title={'S3 兼容存储配置文档'} placement="right">
          <InfoCircleOutlined style={{ color: 'var(--color-text-2)', cursor: 'pointer' }} onClick={handleTitleClick} />
        </Tooltip>
      </SettingTitle>
      <SettingHelpText>
        {'与AWS S3 API兼容的对象存储服务, 例如AWS S3, Cloudflare R2, 阿里云OSS, 腾讯云COS等'}
      </SettingHelpText>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'API 地址'}</SettingRowTitle>
        <Input
          placeholder={'https://s3.example.com'}
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          style={{ width: 250 }}
          type="url"
          onBlur={() => dispatch(setS3Partial({ endpoint: endpoint || '' }))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'区域'}</SettingRowTitle>
        <Input
          placeholder={'Region, 例如: us-east-1'}
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(setS3Partial({ region: region || '' }))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'存储桶'}</SettingRowTitle>
        <Input
          placeholder={'Bucket, 例如: example'}
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(setS3Partial({ bucket: bucket || '' }))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'Access Key ID'}</SettingRowTitle>
        <Input
          placeholder={'Access Key ID'}
          value={accessKeyId}
          onChange={(e) => setAccessKeyId(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(setS3Partial({ accessKeyId: accessKeyId || '' }))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'Secret Access Key'}</SettingRowTitle>
        <Input.Password
          placeholder={'Secret Access Key'}
          value={secretAccessKey}
          onChange={(e) => setSecretAccessKey(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(setS3Partial({ secretAccessKey: secretAccessKey || '' }))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'备份目录（可选）'}</SettingRowTitle>
        <Input
          placeholder={'例如：/cherry-studio'}
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          style={{ width: 250 }}
          onBlur={() => dispatch(setS3Partial({ root: root || '' }))}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'备份操作'}</SettingRowTitle>
        <HStack gap="5px" justifyContent="space-between">
          <Button
            onClick={showBackupModal}
            icon={<SaveOutlined />}
            loading={backuping}
            disabled={!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey}>
            {'立即备份'}
          </Button>
          <Button
            onClick={showBackupManager}
            icon={<FolderOpenOutlined />}
            disabled={!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey}>
            {'管理备份'}
          </Button>
        </HStack>
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'自动同步'}</SettingRowTitle>
        <Selector
          size={14}
          value={syncInterval}
          onChange={onSyncIntervalChange}
          disabled={!endpoint || !accessKeyId || !secretAccessKey}
          options={BACKUP_SYNC_INTERVAL_OPTIONS}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'最大备份数'}</SettingRowTitle>
        <Selector
          size={14}
          value={maxBackups}
          onChange={onMaxBackupsChange}
          disabled={!endpoint || !accessKeyId || !secretAccessKey}
          options={BACKUP_MAX_KEEP_OPTIONS}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow>
        <SettingRowTitle>{'精简备份'}</SettingRowTitle>
        <Switch checked={skipBackupFile} onChange={onSkipBackupFilesChange} />
      </SettingRow>
      <SettingRow>
        <SettingHelpText>{'开启后备份时将跳过文件数据，仅备份配置信息，显著减小备份文件体积'}</SettingHelpText>
      </SettingRow>
      {syncInterval > 0 && (
        <>
          <SettingDivider />
          <SettingRow>
            <SettingRowTitle>{'同步状态'}</SettingRowTitle>
            {renderSyncStatus()}
          </SettingRow>
        </>
      )}
      <>
        <S3BackupModal
          isModalVisible={isModalVisible}
          handleBackup={handleBackup}
          handleCancel={handleCancel}
          backuping={backuping}
          customFileName={customFileName}
          setCustomFileName={setCustomFileName}
        />

        <S3BackupManager
          visible={backupManagerVisible}
          onClose={closeBackupManager}
          s3Config={{
            endpoint,
            region,
            bucket,
            accessKeyId,
            secretAccessKey,
            root
          }}
        />
      </>
    </SettingGroup>
  )
}

export default S3Settings
