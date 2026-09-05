# Cherry-Studio-BB v1.9.0 Release Notes

## 🎯 核心主题：新增「网络电视」独立 Tab + 全仓 Over-Engineering 审查与 IPTV 三轮健壮性加固

本版本为 BB 新增一个**轻量网络电视（IPTV）**功能页——输入 M3U 即看，自动分组、搜索、收藏、最近观看，剧院式播放器支持三引擎（HLS / 裸 MPEG-TS / 原生 MP4）。同时针对 IPTV 模块完成了三轮持续审查加固（DDD 实施、功能实现、UI 重构、交互修复、全仓 ponytail-audit），并同步更新全部开发者文档。

---

## ✨ 新功能

### 1. 网络电视（IPTV Tab，`/iptv`）

**「输入 M3U → 自动整理频道 → 搜索/收藏 → 点击就看」** 的轻量电视页：

- **多播放列表源**：支持远程 URL（`https://...m3u`）与本地 `.m3u/.m3u8` 文件；添加/更新/删除，`&url` 唯一索引防重复
- **自动分类**：按 M3U 的 `group-title` 自动生成「全部 / 收藏 / 最近观看 + 各频道组」分组，保留原始分组顺序、未分组兜底
- **频道搜索**：实时过滤（`useDeferredValue` 防抖，输入不卡顿），频道名大小写不敏感模糊匹配
- **收藏 & 最近观看**：以 **url 为主键的频道快照表**——与播放列表生命周期解耦，更新/删除列表都**不丢收藏**；最近观看 50 条自动去重滚动
- **三引擎播放**：`.m3u8`→hls.js、裸 `.ts/.mpegts/.flv`→mpegts.js、MP4/未知→原生 `<video>`，按 URL 后缀精确路由
- **断流自动重连**：1s→3s→5s 指数退避重试 3 次，成功复位；可手动关闭
- **编码零负担**：M3U 统一走主进程 `fs.readText` 自动 chardet 检测（含 GBK/BOM），renderer 无编码代码

### 2. 剧院式播放器（UI 重构 + 交互升级）

- **与界面像素对齐**：视频区 `flex:1` + `object-fit:contain` 信箱化，任意窗口比例下播放器都与左侧分组栏 / 频道栏**精确对齐**（修复原「播放器比例与界面不成正比」问题），信息条与控制条固定底部不随滚动消失
- **双击全屏 / 退出全屏**：双击视频区互切，全屏自动去圆角铺满
- **页面内最大化**：控制条新增「最大化」按钮（及 Esc 还原），隐藏左栏让播放器铺满内容区，再点还原
- **滚轮调音量 + 音量 OSD**：鼠标在播放器内滚轮即可 ±10 调音量，右上角实时百分比浮层（>100% 琥珀色增益提示）
- **0-200% 音量**：音量滑杆与设置弹窗扩到 200%；>100% 走 **Web Audio 增益链路**（`MediaElementSource→Gain→destination`，懒创建，CORS 安全，Web Audio 不可用自动夹回 100%）
- 主题自适应：左侧两栏跟随应用 8 套主题，播放器恒定暗色「剧院面」

---

## 🐛 修复（IPTV 三轮审查，含全仓审计）

### IPTV 功能实现期
- 解析器对**无 `#EXTM3U` 头 / BOM 头**文件直接抛异常 → `parseM3U` 去 BOM + 自动补头 + 空文本返回空数组
- 缺失属性返回空串 `''` 而非 null → 入库前统一归一化为 null（否则「无 logo 首字母兜底」「未分组」判断全失效）
- `autoplay=false` 时状态机卡死在 connecting → 初始为 paused，流照常加载等用户点播
- hls 场景下 video error 与 hls ERROR **双触发**导致重连计数跳级 → video error 仅 native 引擎处理
- mpegts 直播**断流（源停推）**画面冻结不重连 → 监听 `LOADING_COMPLETE` 走重连
- 静音/恢复污染记忆音量 → 仅在非静音时保存 `lastVolumeBeforeMute`
- 老用户侧边栏**看不到电视图标** → `migrate.ts` 照 habits/knowledge 先例自动补入（显式禁用不强行加回）

### UI 重构与交互
- 播放器高度与可视化区不成正比、控制条被顶出屏幕 → 剧院式 flex 布局 + 信箱化（见上）
- Logo 状态泄漏：虚拟列表复用实例换频道后误显示首字母 → 改记录「哪个地址失败」，prop 变化自动复位（含回归测试）

### 全仓 ponytail-audit（可删减项净删 ~60 行）
- **死代码 5 处**：`retryLogic` 冗余 `waiting` 字段 + `onRetryWaitDone()`；`channelService.isFavorite()`；`playerStore.stop()`；`GroupSidebar.$fixed` prop；`ChannelItem.onDoubleClick` 无主事件
- **shrink 1 处**：`bulkAdd` 无用的 `{ allKeys: true }` 参数
- **无用依赖 / 死文件：0**（逐包逐文件验证均有真实引用；music 模块被 notes 中控台 / widgets 挂件 / store 三方引用，属有意保留）

---

## 📚 开发者文档更新

新增 `docs/release-notes-1.9.0.md`；wiki 五篇同步补 IPTV 内容（并修正 Dexie 版本等滞后项）：

- `01-项目概览`：版本 1.9.0、Dexie schema v12→**v15**、核心功能表加「网络电视」、架构补充行
- `04-渲染进程模块`：路由表加 `/iptv`、pages 目录加 `pages/iptv/`
- `06-数据存储与状态管理`：slice 清单加 `iptvSettings`、Dexie 版本 13→**15**、IPTV 四表明细与 url 主键设计说明
- `07-依赖关系`：渲染层依赖表加 hls.js / mpegts.js / iptv-playlist-parser
- `08-构建运行与测试`：IPTV 测试约定（纯函数 + jsdom 无 indexedDB 约束）

---

## 🔬 质量验证

| 项目 | 结果 |
|---|---|
| Vitest 渲染进程 | ✅ **2997 项测试**（含 IPTV 40 项：`m3uService` / `retryLogic` / `channelService` / `iptvSettingsSlice` / `Logo` / `ChannelItem`） |
| Vitest 全量（main+aicore+shared+renderer+scripts） | ✅ **3779 项测试 0 失败**（lint / typecheck / format 全过，0 error） |

---

## ⚙️ 下载

- **Windows x64 安装包**：`Cherry-Studio-BB-1.9.0-x64-setup.exe`
- **Windows x64 绿色版**：`Cherry-Studio-BB-1.9.0-x64-portable.exe`

> 建议升级前备份数据（IndexedDB 自动保留；本版本仅**纯追加** Dexie v15 四张新表，无存量迁移，老数据零影响）。