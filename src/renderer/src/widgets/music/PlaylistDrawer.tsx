import { db } from '@renderer/databases'
import { useLiveQuery } from 'dexie-react-hooks'
import { X } from 'lucide-react'
import { type FC } from 'react'

import { sendCmd } from './transport'

interface PlaylistDrawerProps {
  currentId: number | null
  onClose: () => void
}

/** 歌单抽屉：Dexie 直读曲库（同源共享 IndexedDB），点击行发命令播放 */
const PlaylistDrawer: FC<PlaylistDrawerProps> = ({ currentId, onClose }) => {
  const tracks = useLiveQuery(async () => (await db.music_tracks.orderBy('order').toArray()) ?? [], [], [])

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span>歌单 · {(tracks ?? []).length} 首</span>
          <button type="button" className="ctl small" title="关闭" onClick={onClose}>
            <X size={13} />
          </button>
        </div>
        <div className="drawer-list">
          {(tracks ?? []).length === 0 ? (
            <div className="drawer-empty">曲库是空的，先在主程序添加音乐</div>
          ) : (
            (tracks ?? []).map((t) => (
              <button
                type="button"
                key={t.id}
                className={`drawer-row ${t.id === currentId ? 'current' : ''}`}
                onClick={() => {
                  sendCmd({ t: 'cmd', a: 'playTrack', id: t.id!, filePath: t.filePath })
                  onClose()
                }}>
                <span className="drawer-title">{t.title}</span>
                <span className="drawer-artist">{t.artist || '未知艺术家'}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default PlaylistDrawer
