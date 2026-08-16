# 音乐 Tab 页设计（BB 版）

> 2026-08-16 · 已与用户确认：功能与 UI 布局参照 `音乐tab页.md`（StickyNotes-Ai 音乐页完整分析），按 Cherry Studio BB 架构重写。

## 1. 总体架构

- 路由 `/music` → `MusicPage`（懒加载），Navbar「音乐」+ 双栏面板（<700px 上下堆叠）：左 = 本地音乐播放器，右 = FM 网络电台。
- 共享 `audioEngine` 单例：一个 `<audio>` 元素，本地/FM 互斥播放（开启一方自动停止另一方）。
- 页面接入照抄 paint 页模式共 8 处：`Router.tsx`（lazy + Route）、`types/index.ts`（`SidebarIcon` 加 `'music'`）、`config/sidebar.ts`（默认图标）、`i18n/label.ts`（sidebarIconKeyMap/titleKeyMap）、`Sidebar.tsx`（iconMap=Music 图标 + pathMap）、`SidebarIconsManager.tsx`、`store/settings.ts` 默认值（经 DEFAULT_SIDEBAR_ICONS 生效）、`store/migrate.ts` 新增版本 214（老用户追加 `'music'`，照 v213 paint 模式）。另补：`TabContainer.tsx` getTabIcon、`LaunchpadPage.tsx` 启动台卡片。

## 2. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 本地播放内核 | 原生 Audio 单例（不引入 Howler） |
| FM API 请求层 | 渲染层直连 fetch（走 Electron session 自动继承代理），复刻超时 10s + 5MB 上限 |
| 持久化 | Dexie（播放列表/收藏/文件夹/FM 收藏）+ Redux persist（音量/模式/FM 配置） |
| 本地文件访问 | 直接 `file://` 播放（BB 惯例），不移植 musicfile:// 协议与路径白名单 |
| 元数据解析 | 主进程新增 MusicService + `music-metadata@^7.14.0`，封面提 `userData/music/covers/` + 96px 缩略图 |
| 交付节奏 | 先 FM 电台（可验收）→ 本地播放器 → 整合 |
| FM 在线电台 ✕ | 永久隐藏（localStorage 排除清单）；自定义电台 ✕ = 真正删除 |
| 自定义电台 UI | 提供「名称+流地址」添加弹窗；API 基础地址编辑器第一版不做（字段预留） |

## 3. FM 电台（复刻 `音乐tab页.md` §7）

- 端点、镜像随机化（all→随机 de1/nl1/at1）、容灾顺序（RADIO_FALLBACKS）、归一化截断规则、仅 http(s) 流地址、剔除 HLS/M3U8 与 bitrate<64、按 url 去重、内置 4 个 RTHK 电台、合并顺序（中港置顶→自定义→线上）、7 天 localStorage 缓存（`{stations, chinaHk, fetchedAt}`；列表 ↻ 清内存、控制栏 ↻ 强制重拉）全部一比一复刻。
- 播放：`preload='none'`、不设 crossOrigin、10s 未 playing 判失败、流错误 2s 后自动切台、连续失败达列表数则停止；网速 = 每秒采样 buffered 增量（回退 128kbps 估算）。
- UI：状态栏（光带动画 + 网速）、播放/上一台/下一台/音量/强制刷新、三个子 tab（热门/中港音乐/搜索）、5 来源循环刷新（topvote→topclick→recent→中国→香港）、搜索三模式（名称/国家/标签）200ms 防抖 + 请求序号守卫、列表项（favicon 32×32 回退 SVG、名称、`国家 · 码率 kbps`、★收藏、✕删除）、收藏过滤视图。

## 4. 本地音乐播放器（复刻 §2/§4/§6）

- 主进程 `MusicService`（`src/main/services/MusicService.ts`，注册于 `src/main/ipc.ts`，通道枚举加 `Music_ReadMetadata/Music_ScanFolder/Music_EnsureThumbs`）：
  - `readMetadata`：parseStream 流式解析 title/artist/album/duration；封面 sha256 前 32 位命名存 covers（>5MB 跳过）；nativeImage 96×96 JPEG85 缩略图；失败降级返回空元数据。
  - `scanFolder`：递归 ≤2000 文件、深度 ≤10、8 种扩展名白名单，返回 `[{filePath,size}]`。
  - `ensureThumbs`：补齐缺失缩略图。
  - 文件/文件夹选择复用现有 `FileStorage.selectFile/selectFolder`。
- 渲染层 `musicLibrary.ts`：addFiles/addFolder/rescanFolders（增量合并、按 filePath 去重、元数据失败用文件名）；Dexie 表 `music_tracks`（含 order 字段支持拖拽排序）/`music_folders`/`radio_favorites`。
- 播放状态机完整移植：顺序/随机/单曲三模式、随机历史栈（上限 100、手动点击重置）、收藏夹播放池（`getPlayablePool`/`pendingReturnToFavorites`）、加载失败自动跳下一首（全列表失败停止）、删除当前曲接续播放、进度用 `timeupdate` 事件驱动。
- UI：工具栏（+文件/+文件夹/刷新/清空/搜索 200ms 防抖）、播放列表（缩略图两级回退、播放高亮、悬停 ★/✕、收藏金色常显、HTML5 拖拽排序并在搜索/收藏过滤时禁用、三种 currentIndex 修正）、底部控制条三栏 Grid（封面+曲名+★ ｜ ★收藏夹过滤+上一首/渐变主按钮/下一首/模式+自绘进度条+时间 ｜ 音量+静音记忆）、三种空态、轻提示条。

## 5. 样式

源 CSS 翻译为 styled-components，颜色映射 BB CSS 变量（`--color-*`，自动适配明暗主题）；保留播放高亮、渐变主按钮、状态栏光带动画；图标 lucide-react。

## 6. CSP 修改

`src/renderer/index.html`：`media-src 'self' file:` → `media-src 'self' file: blob: http: https:`。

## 7. 测试

- vitest 单测（仓库已有 `__tests__` 惯例）：radioApi 归一化/去重/过滤/镜像容灾、播放模式与收藏池状态机、随机历史栈、删除索引修正（网络 mock）。
- 手动验证：`npm run dev` 真实电台流 + 本地文件播放；最后 `npm run build` 打包 exe。

## 8. 新增文件清单

```
packages/shared/IpcChannel.ts                    [改] +3 枚举
src/main/services/MusicService.ts                [新]
src/main/ipc.ts                                  [改] 注册
src/preload/index.ts                             [改] +3 API
src/renderer/index.html                          [改] CSP
src/renderer/src/{Router.tsx,types/index.ts,config/sidebar.ts,i18n/label.ts,
  components/app/Sidebar.tsx,pages/settings/.../SidebarIconsManager.tsx,
  store/settings.ts,store/migrate.ts,store/index.ts,databases/index.ts,
  components/Tab/TabContainer.tsx,pages/launchpad/LaunchpadPage.tsx}  [改]
src/renderer/src/pages/music/
  MusicPage.tsx
  components/{LocalMusicPlayer,Playlist,PlayerControls,FmRadio,FmStationList,VolumeControl}.tsx
  hooks/{useAudioEngine,useLocalPlayer,useFmPlayer}.ts
  services/{radioApi,radioCache,musicLibrary}.ts
  __tests__/{radioApi.test.ts,playLogic.test.ts}
package.json                                      [改] +music-metadata
```
