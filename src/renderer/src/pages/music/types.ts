/** FM 电台统一结构（与 RadioBrowser 原始字段经 radioNormalizeStation 归一化后的结果） */
export type RadioStation = {
  name: string
  url: string
  favicon: string
  country: string
  tags: string
  bitrate: number
  codec: string
  homepage: string
}

export type PlayMode = 'sequential' | 'shuffle' | 'single'

export type FmStatus = 'idle' | 'connecting' | 'playing' | 'paused' | 'error'

/** 本地音乐曲目（Dexie music_tracks 表记录） */
export type MusicTrack = {
  id?: number
  filePath: string
  title: string
  artist: string
  album: string
  duration: number
  coverPath: string
  thumbPath: string
  size: number
  addedAt: number
  favorite: 0 | 1
  order: number
}
