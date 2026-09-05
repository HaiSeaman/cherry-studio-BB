import { loadSyncState, type SyncConfigDto, syncOnce } from '@renderer/services/SyncAdapter'
import { Button, Input, message, Radio, Space } from 'antd'
import { useState } from 'react'
import styled from 'styled-components'

const STORAGE_KEY = 'rk-cross-device-sync'

type SavedConfig = { channel: 'none' | 's3' | 'webdav'; s3?: Record<string, string>; webdav?: Record<string, string> }

function loadConfig(): SavedConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedConfig) : { channel: 'none' }
  } catch {
    return { channel: 'none' }
  }
}

const CrossDeviceSyncSettings = () => {
  const [config, setConfig] = useState<SavedConfig>(loadConfig)
  const [s3, setS3] = useState<Record<string, string>>(
    config.s3 ?? { endpoint: '', accessKeyId: '', secretAccessKey: '', bucket: '', region: 'auto' }
  )
  const [wd, setWd] = useState<Record<string, string>>(
    config.webdav ?? { webdavHost: '', webdavUser: '', webdavPass: '' }
  )
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState('')
  const [lastSync, setLastSync] = useState('')

  const setField = (group: 's3' | 'webdav', key: string, value: string) => {
    if (group === 's3') setS3((p) => ({ ...p, [key]: value }))
    else setWd((p) => ({ ...p, [key]: value }))
  }

  const save = () => {
    const next: SavedConfig = { ...config, s3, webdav: wd }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setConfig(next)
    message.success('同步配置已保存')
  }

  const syncNow = async () => {
    if (config.channel === 'none') {
      message.warning('请先选择一个同步通道')
      return
    }
    setSyncing(true)
    setStatus('正在同步…')
    const result = await syncOnce({ channel: config.channel, s3, webdav: wd } as SyncConfigDto)
    setStatus(`${new Date().toLocaleString()} · ${result.message}`)
    setSyncing(false)
    loadSyncState()
      .then((s) => s.lastSyncAt && setLastSync(new Date(Number(s.lastSyncAt)).toLocaleString()))
      .catch(() => {})
  }

  return (
    <Container>
      <h3 style={{ margin: '0 0 12px' }}>跨设备同步（便签 / 待办 / 日历笔记 / 习惯打卡 / 提醒）</h3>
      <p style={{ color: '#999', margin: '0 0 12px' }}>
        与手机端 RK-BB 通过<code>cherry-rk-sync/</code>目录双向同步。通道二选一。
      </p>

      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Radio.Group
          value={config.channel}
          onChange={(e) => setConfig((p) => ({ ...p, channel: e.target.value as SavedConfig['channel'] }))}>
          <Radio value="none">关闭</Radio>
          <Radio value="s3">S3 / 兼容对象存储</Radio>
          <Radio value="webdav">WebDAV（如坚果云）</Radio>
        </Radio.Group>

        {config.channel !== 'none' && (
          <>
            {config.channel === 's3' && (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                  placeholder="Endpoint（https://s3.example.com）"
                  value={s3.endpoint ?? ''}
                  onChange={(e) => setField('s3', 'endpoint', e.target.value)}
                />
                <Input
                  placeholder="Access Key"
                  value={s3.accessKeyId ?? ''}
                  onChange={(e) => setField('s3', 'accessKeyId', e.target.value)}
                />
                <Input
                  placeholder="Secret Key"
                  type="password"
                  value={s3.secretAccessKey ?? ''}
                  onChange={(e) => setField('s3', 'secretAccessKey', e.target.value)}
                />
                <Input
                  placeholder="Bucket"
                  value={s3.bucket ?? ''}
                  onChange={(e) => setField('s3', 'bucket', e.target.value)}
                />
                <Input
                  placeholder="Region（默认 auto）"
                  value={s3.region ?? 'auto'}
                  onChange={(e) => setField('s3', 'region', e.target.value)}
                />
              </Space>
            )}
            {config.channel === 'webdav' && (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                  placeholder="服务器地址（https://dav.example.com）"
                  value={wd.webdavHost ?? ''}
                  onChange={(e) => setField('webdav', 'webdavHost', e.target.value)}
                />
                <Input
                  placeholder="用户名"
                  value={wd.webdavUser ?? ''}
                  onChange={(e) => setField('webdav', 'webdavUser', e.target.value)}
                />
                <Input
                  placeholder="密码 / 应用密码"
                  type="password"
                  value={wd.webdavPass ?? ''}
                  onChange={(e) => setField('webdav', 'webdavPass', e.target.value)}
                />
              </Space>
            )}
            <Space>
              <Button onClick={save}>保存配置</Button>
              <Button type="primary" loading={syncing} onClick={syncNow}>
                立即同步
              </Button>
            </Space>
          </>
        )}

        {(status || lastSync) && (
          <div style={{ color: '#666', fontSize: 12 }}>
            {lastSync && <div>上次同步：{lastSync}</div>}
            {status && <div>{status}</div>}
          </div>
        )}
      </Space>
    </Container>
  )
}

const Container = styled.div`
  padding: 16px;
`

export default CrossDeviceSyncSettings
