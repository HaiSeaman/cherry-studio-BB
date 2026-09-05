/** IPTV Tab 领域类型（表结构见 databases/index.ts version 15） */

export type IptvPlaylist = {
  id: number
  name: string
  url: string
  type: 'remote' | 'local'
  updatedAt: number
}

export type IptvChannel = {
  id: number
  playlistId: number
  name: string
  url: string
  logo: string | null
  group: string | null
  tvgId: string | null
}

/** 收藏：url 主键的频道快照表——与播放列表生命周期解耦，更新/删除列表不影响收藏 */
export type IptvFavorite = {
  url: string
  name: string
  logo: string | null
  group: string | null
  tvgId: string | null
  addedAt: number
}

/** 最近观看：url 主键快照（重复观看 = put 更新 playedAt，天然按频道去重） */
export type IptvHistory = {
  url: string
  name: string
  logo: string | null
  playedAt: number
}

/** 播放引擎类型（按 URL 后缀路由，见 services/playerStore.ts selectEngine） */
export type IptvEngineType = 'hls' | 'mpegts' | 'native'
