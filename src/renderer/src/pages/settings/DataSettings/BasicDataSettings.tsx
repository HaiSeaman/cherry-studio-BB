import { LoadingOutlined } from '@ant-design/icons'
import { HStack } from '@renderer/components/Layout'
import BackupRestorePopup from '@renderer/components/Popups/BackupRestorePopup'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useSettings } from '@renderer/hooks/useSettings'
import { useTimer } from '@renderer/hooks/useTimer'
import { reset } from '@renderer/services/BackupService'
import store, { useAppDispatch } from '@renderer/store'
import { setSkipBackupFile as _setSkipBackupFile } from '@renderer/store/settings'
import type { AppInfo } from '@renderer/types'
import { occupiedDirs } from '@shared/config/constant'
import { Button, Progress, Switch, Tooltip, Typography } from 'antd'
import { FolderOpen, FolderOutput, SaveIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import styled from 'styled-components'

import { SettingDivider, SettingGroup, SettingHelpText, SettingRow, SettingRowTitle, SettingTitle } from '..'

const BasicDataSettings: React.FC = () => {
  const [appInfo, setAppInfo] = useState<AppInfo>()
  const [cacheSize, setCacheSize] = useState<string>('')
  const { theme } = useTheme()
  const { setTimeoutTimer } = useTimer()
  const { imageSavePath, setImageSavePath } = useSettings()

  const _skipBackupFile = store.getState().settings.skipBackupFile
  const [skipBackupFile, setSkipBackupFile] = useState<boolean>(_skipBackupFile)

  const dispatch = useAppDispatch()

  useEffect(() => {
    void window.api.getAppInfo().then(setAppInfo)
    void window.api.getCacheSize().then(setCacheSize)
  }, [])

  const handleSelectAppDataPath = async () => {
    if (!appInfo || !appInfo.appDataPath) {
      return
    }

    const newAppDataPath = await window.api.select({
      properties: ['openDirectory', 'createDirectory'],
      title: '更改应用数据目录'
    })

    if (!newAppDataPath) {
      return
    }

    // check new app data path is root path
    const pathParts = newAppDataPath.split(/[/\\]/).filter((part: string) => part !== '')
    if (pathParts.length <= 1) {
      window.toast.error('新路径不能是根路径')
      return
    }

    // check new app data path is not in old app data path
    const isInOldPath = await window.api.isPathInside(newAppDataPath, appInfo.appDataPath)
    if (isInOldPath) {
      window.toast.error('新路径与旧路径相同，请选择其他路径')
      return
    }

    // check new app data path is not in app install path
    const isInInstallPath = await window.api.isPathInside(newAppDataPath, appInfo.installPath)
    if (isInInstallPath) {
      window.toast.error('新路径与应用安装路径相同，请选择其他路径')
      return
    }

    // check new app data path has write permission
    const hasWritePermission = await window.api.hasWritePermission(newAppDataPath)
    if (!hasWritePermission) {
      window.toast.error('新路径没有写入权限')
      return
    }

    const migrationTitle = <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{'数据迁移'}</div>
    const migrationClassName = 'migration-modal'
    void showMigrationConfirmModal(appInfo.appDataPath, newAppDataPath, migrationTitle, migrationClassName)
  }

  const doubleConfirmModalBeforeCopyData = (newPath: string) => {
    window.modal.confirm({
      title: '新路径不为空',
      content: '新路径不为空，将覆盖新路径中的数据，有数据丢失和复制失败的风险，是否继续？',
      centered: true,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        window.toast.info({
          title: '应用可能会重启多次以应用更改',
          timeout: 2000
        })
        setTimeoutTimer(
          'doubleConfirmModalBeforeCopyData',
          () => {
            void window.api.relaunchApp({
              args: ['--new-data-path=' + newPath]
            })
          },
          500
        )
      }
    })
  }

  // 显示确认迁移的对话框
  const showMigrationConfirmModal = async (
    originalPath: string,
    newPath: string,
    title: React.ReactNode,
    className: string
  ) => {
    let shouldCopyData = !(await window.api.isNotEmptyDir(newPath))

    const PathsContent = () => (
      <div>
        <MigrationPathRow>
          <MigrationPathLabel>{'原始路径'}:</MigrationPathLabel>
          <MigrationPathValue>{originalPath}</MigrationPathValue>
        </MigrationPathRow>
        <MigrationPathRow style={{ marginTop: '16px' }}>
          <MigrationPathLabel>{'新路径'}:</MigrationPathLabel>
          <MigrationPathValue>{newPath}</MigrationPathValue>
        </MigrationPathRow>
      </div>
    )

    const CopyDataContent = () => (
      <div>
        <MigrationPathRow style={{ marginTop: '20px', flexDirection: 'row', alignItems: 'center' }}>
          <Switch
            defaultChecked={shouldCopyData}
            onChange={(checked) => (shouldCopyData = checked)}
            style={{ marginRight: '8px' }}
            title={'复制数据，会自动重启后将原始目录数据复制到新目录'}
          />
          <MigrationPathLabel style={{ fontWeight: 'normal', fontSize: '14px' }}>
            {'复制数据，会自动重启后将原始目录数据复制到新目录'}
          </MigrationPathLabel>
        </MigrationPathRow>
      </div>
    )

    window.modal.confirm({
      title,
      className,
      width: 'min(600px, 90vw)',
      style: { minHeight: '400px' },
      content: (
        <MigrationModalContent>
          <PathsContent />
          <CopyDataContent />
          <MigrationNotice>
            <p style={{ color: 'var(--color-warning)' }}>{'应用可能会重启多次以应用更改'}</p>
            <p style={{ color: 'var(--color-text-3)', marginTop: '8px' }}>
              {'复制数据将需要一些时间，复制期间不要关闭应用'}
            </p>
          </MigrationNotice>
        </MigrationModalContent>
      ),
      centered: true,
      okButtonProps: {
        danger: true
      },
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          if (shouldCopyData) {
            if (await window.api.isNotEmptyDir(newPath)) {
              doubleConfirmModalBeforeCopyData(newPath)
              return
            }

            window.toast.info({
              title: '应用可能会重启多次以应用更改',
              timeout: 3000
            })
            setTimeoutTimer(
              'showMigrationConfirmModal_1',
              () => {
                void window.api.relaunchApp({
                  args: ['--new-data-path=' + newPath]
                })
              },
              500
            )
            return
          }
          await window.api.setAppDataPath(newPath)
          window.toast.success('路径已更改成功')

          setAppInfo(await window.api.getAppInfo())

          setTimeoutTimer(
            'showMigrationConfirmModal_2',
            () => {
              window.toast.success('数据目录已更改，应用将重启以应用更改')
              void window.api.setStopQuitApp(false, '')
              void window.api.relaunchApp()
            },
            500
          )
        } catch (error) {
          void window.api.setStopQuitApp(false, '')
          window.toast.error({
            title: '数据目录更改失败' + ': ' + error,
            timeout: 5000
          })
        }
      }
    })
  }

  // 显示进度模态框
  const showProgressModal = (title: React.ReactNode, className: string, PathsContent: React.FC) => {
    let currentProgress = 0
    let progressInterval: NodeJS.Timeout | null = null

    const loadingModal = window.modal.info({
      title,
      className,
      width: 'min(600px, 90vw)',
      style: { minHeight: '400px' },
      icon: <LoadingOutlined style={{ fontSize: 18 }} />,
      content: (
        <MigrationModalContent>
          <PathsContent />
          <MigrationNotice>
            <p>{'正在将数据复制到新位置...'}</p>
            <div style={{ marginTop: '12px' }}>
              <Progress percent={currentProgress} status="active" strokeWidth={8} />
            </div>
            <p style={{ color: 'var(--color-warning)', marginTop: '12px', fontSize: '13px' }}>
              {'数据复制中，不要强制退出 app, 复制完成后会自动重启应用'}
            </p>
          </MigrationNotice>
        </MigrationModalContent>
      ),
      centered: true,
      closable: false,
      maskClosable: false,
      okButtonProps: { style: { display: 'none' } }
    })

    const updateProgress = (progress: number, status: 'active' | 'success' = 'active') => {
      loadingModal.update({
        title,
        content: (
          <MigrationModalContent>
            <PathsContent />
            <MigrationNotice>
              <p>{'正在将数据复制到新位置...'}</p>
              <div style={{ marginTop: '12px' }}>
                <Progress percent={Math.round(progress)} status={status} strokeWidth={8} />
              </div>
              <p style={{ color: 'var(--color-warning)', marginTop: '12px', fontSize: '13px' }}>
                {'数据复制中，不要强制退出 app, 复制完成后会自动重启应用'}
              </p>
            </MigrationNotice>
          </MigrationModalContent>
        )
      })
    }

    progressInterval = setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += Math.random() * 5 + 1
        if (currentProgress > 95) currentProgress = 95
        updateProgress(currentProgress)
      }
    }, 500)

    return { loadingModal, progressInterval, updateProgress }
  }

  // 开始迁移数据
  const startMigration = async (
    originalPath: string,
    newPath: string,
    progressInterval: NodeJS.Timeout | null,
    updateProgress: (progress: number, status?: 'active' | 'success') => void,
    loadingModal: { destroy: () => void }
  ): Promise<void> => {
    await window.api.flushAppData()

    await new Promise((resolve) => setTimeoutTimer('startMigration_1', resolve, 2000))

    const copyResult = await window.api.copy(
      originalPath,
      newPath,
      occupiedDirs.map((dir) => originalPath + '/' + dir)
    )

    if (progressInterval) {
      clearInterval(progressInterval)
    }

    updateProgress(100, 'success')

    if (!copyResult.success) {
      await new Promise<void>((resolve) => {
        setTimeoutTimer(
          'startMigration_2',
          () => {
            loadingModal.destroy()
            window.toast.error({
              title: '复制数据失败' + ': ' + copyResult.error,
              timeout: 5000
            })
            resolve()
          },
          500
        )
      })

      throw new Error(copyResult.error || 'Unknown error during copy')
    }

    await window.api.setAppDataPath(newPath)

    await new Promise((resolve) => setTimeoutTimer('startMigration_3', resolve, 500))

    loadingModal.destroy()

    window.toast.success({
      title: '已成功复制数据到新位置',
      timeout: 2000
    })
  }

  useEffect(() => {
    const handleDataMigration = async () => {
      const newDataPath = await window.api.getDataPathFromArgs()
      if (!newDataPath) return

      const originalPath = (await window.api.getAppInfo())?.appDataPath
      if (!originalPath) return

      const title = <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{'数据迁移'}</div>
      const className = 'migration-modal'

      const PathsContent = () => (
        <div>
          <MigrationPathRow>
            <MigrationPathLabel>{'原始路径'}:</MigrationPathLabel>
            <MigrationPathValue>{originalPath}</MigrationPathValue>
          </MigrationPathRow>
          <MigrationPathRow style={{ marginTop: '16px' }}>
            <MigrationPathLabel>{'新路径'}:</MigrationPathLabel>
            <MigrationPathValue>{newDataPath}</MigrationPathValue>
          </MigrationPathRow>
        </div>
      )

      const { loadingModal, progressInterval, updateProgress } = showProgressModal(title, className, PathsContent)
      try {
        void window.api.setStopQuitApp(true, '应用目前在迁移数据，不能退出')
        await startMigration(originalPath, newDataPath, progressInterval, updateProgress, loadingModal)

        setAppInfo(await window.api.getAppInfo())

        setTimeoutTimer(
          'handleDataMigration',
          () => {
            window.toast.success('数据目录已更改，应用将重启以应用更改')
            void window.api.setStopQuitApp(false, '')
            void window.api.relaunchApp({
              args: ['--user-data-dir=' + newDataPath]
            })
          },
          1000
        )
      } catch (error) {
        void window.api.setStopQuitApp(false, '')
        window.toast.error({
          title: '复制数据失败' + ': ' + error,
          timeout: 5000
        })
      } finally {
        if (progressInterval) {
          clearInterval(progressInterval)
        }
        loadingModal.destroy()
      }
    }

    void handleDataMigration()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenPath = (path?: string) => {
    if (!path) return
    if (path?.endsWith('log')) {
      const dirPath = path.split(/[/\\]/).slice(0, -1).join('/')
      void window.api.openPath(dirPath)
    } else {
      void window.api.openPath(path)
    }
  }

  const handleClearCache = () => {
    window.modal.confirm({
      title: '清除缓存',
      content: '清除缓存将删除应用缓存的数据，包括小程序数据。此操作不可恢复，是否继续？',
      okText: '清除缓存',
      centered: true,
      okButtonProps: {
        danger: true
      },
      onOk: async () => {
        try {
          await window.api.clearCache()
          await window.api.getCacheSize().then(setCacheSize)
          window.toast.success('缓存清除成功')
        } catch (error) {
          window.toast.error('清除缓存失败')
        }
      }
    })
  }

  const onSkipBackupFilesChange = (value: boolean) => {
    setSkipBackupFile(value)
    dispatch(_setSkipBackupFile(value))
  }

  const handleSelectImageSavePath = async () => {
    const newPath = await window.api.select({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择生成图片/视频保存路径'
    })

    if (!newPath) {
      return
    }

    setImageSavePath(newPath)
    window.toast.success('图片保存路径已更新')
  }

  const handleOpenImageSavePath = () => {
    if (imageSavePath) {
      void window.api.openPath(imageSavePath)
    }
  }

  const handleResetImageSavePath = () => {
    setImageSavePath('')
    window.toast.success('已恢复默认保存路径')
  }

  return (
    <>
      <SettingGroup theme={theme}>
        <SettingTitle>{'数据设置'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'数据备份与恢复'}</SettingRowTitle>
          <HStack gap="5px" justifyContent="space-between">
            <Button onClick={() => BackupRestorePopup.show('backup')} icon={<SaveIcon size={14} />}>
              {'备份'}
            </Button>
            <Button onClick={() => BackupRestorePopup.show('restore')} icon={<FolderOpen size={14} />}>
              {'恢复'}
            </Button>
          </HStack>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'精简备份'}</SettingRowTitle>
          <Switch checked={skipBackupFile} onChange={onSkipBackupFilesChange} />
        </SettingRow>
        <SettingRow>
          <SettingHelpText>
            {'备份时跳过备份图片、知识库等数据文件，仅备份聊天记录和设置。减少空间占用，加快备份速度'}
          </SettingHelpText>
        </SettingRow>
      </SettingGroup>
      <SettingGroup theme={theme}>
        <SettingTitle>{'数据目录'}</SettingTitle>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'应用数据'}</SettingRowTitle>
          <PathRow>
            <PathText style={{ color: 'var(--color-text-3)' }} onClick={() => handleOpenPath(appInfo?.appDataPath)}>
              {appInfo?.appDataPath}
            </PathText>
            <Tooltip title={'修改目录'}>
              <FolderOutput onClick={handleSelectAppDataPath} style={{ cursor: 'pointer' }} size={16} />
            </Tooltip>
            <HStack gap="5px" style={{ marginLeft: '8px' }}>
              <Button onClick={() => handleOpenPath(appInfo?.appDataPath)}>{'打开目录'}</Button>
            </HStack>
          </PathRow>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'应用日志'}</SettingRowTitle>
          <PathRow>
            <PathText style={{ color: 'var(--color-text-3)' }} onClick={() => handleOpenPath(appInfo?.logsPath)}>
              {appInfo?.logsPath}
            </PathText>
            <HStack gap="5px" style={{ marginLeft: '8px' }}>
              <Button onClick={() => handleOpenPath(appInfo?.logsPath)}>{'打开日志'}</Button>
            </HStack>
          </PathRow>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'生成图片/视频保存路径'}</SettingRowTitle>
          <PathRow>
            <PathText style={{ color: 'var(--color-text-3)' }} onClick={handleOpenImageSavePath}>
              {imageSavePath || '未设置（默认保存在应用缓存数据文件夹）'}
            </PathText>
            <HStack gap="5px" style={{ marginLeft: '8px' }}>
              <Button onClick={handleSelectImageSavePath}>{'选择目录'}</Button>
              {imageSavePath && <Button onClick={handleOpenImageSavePath}>{'打开目录'}</Button>}
              {imageSavePath && <Button onClick={handleResetImageSavePath}>{'恢复默认'}</Button>}
            </HStack>
          </PathRow>
        </SettingRow>
        <SettingRow>
          <SettingHelpText>
            {'灵感生图与动感视频助手生成的图片/视频会自动保存到该目录；未设置时仅保留在应用内部存储中'}
          </SettingHelpText>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>
            {'清除缓存'}
            {cacheSize && <CacheText>({cacheSize}MB)</CacheText>}
          </SettingRowTitle>
          <HStack gap="5px">
            <Button onClick={handleClearCache}>{'清除缓存'}</Button>
          </HStack>
        </SettingRow>
        <SettingDivider />
        <SettingRow>
          <SettingRowTitle>{'重置数据'}</SettingRowTitle>
          <HStack gap="5px">
            <Button onClick={reset} danger>
              {'重置数据'}
            </Button>
          </HStack>
        </SettingRow>
      </SettingGroup>
    </>
  )
}

const CacheText = styled(Typography.Text)`
  color: var(--color-text-3);
  font-size: 12px;
  margin-left: 5px;
  line-height: 16px;
  display: inline-block;
  vertical-align: middle;
  text-align: left;
`

const PathText = styled(Typography.Text)`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: middle;
  text-align: right;
  margin-left: 5px;
  cursor: pointer
`

const PathRow = styled(HStack)`
  min-width: 0;
  flex: 1;
  width: 0;
  align-items: center;
  gap: 5px;
`

// Add styled components for migration modal
const MigrationModalContent = styled.div`
  padding: 20px 0 10px;
  display: flex;
  flex-direction: column;
`

const MigrationNotice = styled.div`
  margin-top: 24px;
  font-size: 14px;
`

const MigrationPathRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`

const MigrationPathLabel = styled.div`
  font-weight: 600;
  font-size: 15px;
  color: var(--color-text-1);
`

const MigrationPathValue = styled.div`
  font-size: 14px;
  color: var(--color-text-2);
  background-color: var(--color-background-soft);
  padding: 8px 12px;
  border-radius: 4px;
  word-break: break-all;
  border: 1px solid var(--color-border);
`

export default BasicDataSettings
