# APK 开发方案

> 基于 **RikkaHub**（官方仓库）fork 改造的安卓 APP 开发方案
> 定位：轻量级效率工具 + AI 助手，与电脑端 **cherry-studio-BB** 通过 **S3 / WebDAV** 双向同步数据
> 本文档是方向讨论后的**修订定稿**，包含：审计修正记录、同步协议、双端改造方案、分阶段实施步骤、逐项验收清单。

---

## 0. 文档信息

| 项目 | 内容 |
|---|---|
| 文档版本 | v2.0（审计修订版） |
| 编制日期 | 2026 年 |
| 基底项目 | RikkaHub（`https://github.com/rikkahub/rikkahub`，AGPLv3） |
| 电脑端项目 | cherry-studio-BB（本地 `D:\AI\Github\Cherry\cherry-studio-BB`） |
| 维护策略 | fork 后**自主维护分支，不合并上游**（无上游同步成本，可放手魔改） |
| 开源义务 | fork 改造后开源到用户自己的 GitHub，保留 AGPLv3 与原作者版权声明 |

---

## 1. 目标与关键决策回顾

### 1.1 目标
做一个只面向安卓的 APK，包含：
- **AI 对话**（现成）
- **AI 图片生成**（现成）
- **便签 / 待办 / 日历（每日笔记）/ 打卡（习惯）/ 提醒**（新开发）
- **在线电台流播放**（新开发）

同时实现 **手机 ↔ 电脑双向数据同步**，同步通道为 **S3 与 WebDAV**（两条通道都可配，用户任选其一或都用）。

### 1.2 明确不做（本期范围外）
- ❌ 知识库（RAG）
- ❌ 视频生成/播放
- ❌ AI 对话记录、生图历史的跨端同步（避免复杂冲突；可作为二期）
- ❌ 便签历史快照（`hub_note_history`）与每日活动计数（`hub_activity`）同步（默认关闭，可配置）

### 1.3 已经拍板的关键决策（来自前期沟通）
1. 基底 = **RikkaHub 官方仓库**（不用第三方 fork，官方明示 fork 有隐私风险）。
2. 用户 fork 后开源、自维护，**不与上游合并** → AGPLv3 义务自动满足。
3. 电脑端 cherry-studio-BB **新增一个"同步适配器"模块**（只增不改，不碰现有功能）。
4. 音乐电台用**在线电台流**（网络音频流地址列表）。

---

## 2. 审计修订记录（v1 → v2 修正了什么）

本版相对前期讨论稿做了 7 处修正/补充，均为**实测验证后**的结论：

| # | v1 的说法 | 问题 | v2 修正 |
|---|---|---|---|
| 1 | 提醒用 WorkManager 定时 | WorkManager 定时**精度只有分钟级**且受系统省电（Doze）延迟，不能做"到点提醒" | 普通提醒用 WorkManager（省电）；**精确提醒用 AlarmManager**（`setExactAndAllowWhileIdle`），需新增 `USE_EXACT_ALARM` 权限（自装 APK 无商店政策限制） |
| 2 | "同一条记录谁后改听谁的" | 两端数据库**自增数字 id 会撞车**（电脑 id=5 和手机 id=5 是不同内容），照旧合并会互相覆盖 | 引入 **`syncId`（UUID，跨端唯一身份）** 作为同步主键；RikkaHub 新表主键直接用 UUID 字符串；BB 端 Dexie 表加 `syncUuid` 列 |
| 3 | 音乐电台"加一个播放器库" | 安卓 **8+ 后台播放音频必须前台服务**，14+ 强制声明服务类型 | 补：Media3 ExoPlayer + `MediaSessionService` 前台服务 + 新增 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限 |
| 4 | 未提构建环境 | **实测本环境无 JDK / Android SDK / adb / gradle**，无法编译 APK | 新增"阶段 0 环境准备"（JDK 17 + Android Studio + SDK 37 + keystore + 真机 USB 调试），构建验收只能发生在用户 Windows 机 |
| 5 | 未提包名 | RikkaHub 官方包名 `me.rerere.rikkahub`，直接沿用会与官方应用冲突/冒名 | fork 首步**必须改 `applicationId`**（如 `io.github.<你的账号>.rknotes`）与应用名 |
| 6 | 同步范围含糊 | 曾暗示全部数据可同步 | 明确：**只同步 5 类效率数据**（便签/待办/日历笔记/习惯/打卡记录/闹钟提醒表），AI 对话与生图历史不同步 |
| 7 | 权限清单不完整 | Manifest 实测已含 `POST_NOTIFICATIONS`、`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_DATA_SYNC`，但缺精确闹钟与音乐播放权限 | v2 完整权限清单见 §7.7 |

---

## 3. 总体架构

```
┌────────────────────────────────────────────────────────────┐
│  PC 端：cherry-studio-BB（Electron + React + Dexie/IndexedDB）│
│  ┌── 现有功能（聊天/生图/知识库/便签/待办/日历/打卡）不改 ──┐     │
│  └── 新增：同步适配器（导出 JSON → 上传；下载 JSON → 合并）──┘     │
└──────────────────────┬─────────────────────────────────────┘
                       │  每表一个 JSON 文件
              ┌────────▼────────┐
              │ S3 / WebDAV 文件柜 │  ← 无人值守中转，无需人工操作
              │（cherry-rk-sync/） │
              └────────┬────────┘
┌──────────────────────▼─────────────────────────────────────┐
│  手机端：RikkaHub fork（Kotlin + Compose + Room）             │
│  ┌── AI 对话 / 生图（现成） ────────────────────────────────┐  │
│  ├── 新增：便签/待办/日历/打卡 页面 + Room 新表 ─────────────┤  │
│  ├── 新增：提醒（AlarmManager 精确 + 通知）─────────────────┤  │
│  ├── 新增：在线电台（Media3 + 前台服务）─────────────────────┤  │
│  └── 新增：同步引擎（复用 S3Client/WebDavClient）+ 设置页 ────┘  │
└────────────────────────────────────────────────────────────┘
```

两端**只有**各自客户端软件；文件柜自动中转；无任何需要人工操作的"服务器端"。

---

## 4. 技术基线（均经实测代码确认）

### 4.1 RikkaHub 侧（fork 基线，克隆版本 2.4.x）
| 项 | 值 |
|---|---|
| 语言/UI | Kotlin（≈84%）+ Jetpack Compose，Material You |
| 导航 | Navigation 3 Compose（`Screen : NavKey` sealed interface → `entryProvider`） |
| 数据库 | Room，**version 24，8 张表**，AutoMigration 链（1→24） |
| 依赖注入 | Koin |
| SDK | minSdk 26 / targetSdk 37 / compileSdk 37 / JVM 17 |
| 版本 | versionName 2.4.x / versionCode 183 |
| APK 产出 | Gradle：`assembleDebug` / `assembleRelease`；`isUniversalApk=true`（通用 APK，不分架构） |
| 已具备 | 通知渠道 ×3、`NotificationUtil`（权限判断/notify/cancel）、WorkManager 依赖、S3 客户端（`data/sync/s3/S3Client.kt`）、WebDAV 客户端（`data/sync/webdav/WebDavClient.kt`） |
| 无需 | bun / node（`web` 模块仅内嵌网页服务器），原生改造不依赖 |

**实测的 S3 / WebDAV 客户端能力（同步直接复用，无需重写）：**
- S3Client：`putObject / getObject / getObjectStream / downloadObjectToFile / deleteObject / headObject / listObjects / objectExists / getPublicUrl`
- WebDavClient：`put / get / getStream / downloadToFile / delete / head / mkcol / propfind / exists / ensureCollectionExists / list`

### 4.2 BB 侧（cherry-studio-BB）
| 项 | 值 |
|---|---|
| 框架 | Electron + React + TypeScript |
| 本地库 | Dexie/IndexedDB：`hub_notes / hub_todos / hub_alarms / hub_day_notes / hub_activity / hub_note_history`（v12）、`habits / habit_records`（v13） |
| 备份 | 整库 zip（LevelDB 二进制 + metadata.json），**手机端读不了 → 必须走新 JSON 格式** |
| 同步基础设施 | `BackupService.startAutoSync/stopAutoSync`（定时器）、S3/WebDAV 客户端封装于主进程（`BackupManager` + `S3Storage` + `WebDav`），渲染层经 `window.api.backup.*` 调用 |
| 配置字段 | S3：`endpoint/region/bucket/accessKeyId/secretAccessKey/root/syncInterval`；WebDAV：`webdavHost/webdavUser/webdavPass/webdavPath/syncInterval` |
| 注意 | `BackupManager.ts` 头部标注 **废弃、v2 重构中**——适配器**不得修改该文件**，另建独立模块 |

---

## 5. 同步协议设计（核心）

### 5.1 存储布局
在用户配置的 S3（bucket 的 `root` 前缀下）或 WebDAV（`webdavPath` 下）统一建目录：

```
cherry-rk-sync/
├── manifest.json          # schema 版本、设备信息、最近同步时间
├── notes.json             # 便签
├── todos.json             # 待办
├── day_notes.json         # 日历每日笔记
├── habits.json            # 习惯（打卡项）
├── habit_records.json     # 打卡记录
├── alarms.json            # 闹钟/提醒
```

### 5.2 记录统一字段（与 BB 现有模型对齐）
每条记录必须包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `syncId` | string (UUID) | **跨端唯一身份（本次审计新增，关键）** |
| `createdAt` | number | 创建时间，毫秒时间戳 |
| `updatedAt` | number | 最后修改时间，毫秒时间戳（合并依据） |
| `deleted` | boolean | 软删除标记（删除也同步，防止"删了复活"） |

各表特有字段（对齐 BB 现有表结构）：

- **notes.json**：`content`、`status`（active/archived/trashed，trashed/archived 视为删除态）
- **todos.json**：`text`、`done`、`completedAt?`、`status`
- **day_notes.json**：`date`（'YYYY-MM-DD'）、`content`
- **habits.json**：`name`、`icon`、`color`、`order`、`frequencyType`（daily/timesPerWeek/daysOfWeek）、`timesPerWeek?`、`daysOfWeek?`、`archived`（删除态）
- **habit_records.json**：`habitSyncId`（关联习惯的 syncId）、`date`（'YYYY-MM-DD'）、`status`（done/skip）
- **alarms.json**：`h`、`m`、`s`、`enabled`、`label`、`sound`、`date?`、`lastTriggerKey?`（用于防重复触发）

### 5.3 ID 策略（本次审计新增，最重要的一条）
- 两端**禁止**用各自的自增数字 id 做同步键（会撞车）。
- **RikkaHub 新表主键 = String UUID**（客户端生成）。
- **BB 现有表**：Dexie 升版（v13→v14）为 hub 表加 `syncUuid` 索引列；老记录首次导出时**懒生成** UUID 并回写（无需一次性迁移）。
- 合并时按 `syncId` 匹配记录身份。

### 5.4 合并规则（last-write-wins）
对每个 `syncId`：
1. 只在一端存在 → 复制到另一端（新增）。
2. 两端都存在 → `updatedAt` 大者胜（整个记录覆盖）。
3. 任一端 `deleted=true` → 另一端执行软删除。
4. 同一设备不做重复导入（`manifest.json` 记录 `lastSyncAt`，小于该时间的记录跳过）。

### 5.5 同步触发
- **手机端**：打开 APP 时自动同步一次 + 设置页手动按钮 + 可选定时（WorkManager Periodic，如每 30 分钟）。
- **电脑端**：复用现有 `startAutoSync` 定时器（分钟级），在其回调里加"表级 JSON 同步"；设置页加手动"立即同步"按钮。

### 5.6 同步引擎流程（两端一致，各写一份）
```
导入：读文件柜 JSON → 逐条按 syncId 与本地 merge（规则见 5.4）→ 写本地库
导出：本地表 → 组装 JSON（含新增记录懒生成 syncId）→ 上传覆盖文件柜对应文件
（先导入再导出，一轮完成；失败重试 3 次，保留 lastSyncError 提示）
```

### 5.7 边界与异常
- 首次同步：两端全量互导，以 updatedAt 合并，不会丢数据。
- 时间戳相同（并发修改）：以 `syncId` 字典序的大者胜，保证确定性。
- S3 与 WebDAV 同时配置时：**以 WebDAV 为准**（或做成单选，UI 二选一，避免双源打架）。
- 时区：时间戳一律存**本地毫秒**（BB 现模型即如此），日期字符串用本地时区 'YYYY-MM-DD'；提醒触发用本地时间。

---

## 6. 手机端改造方案（RikkaHub fork）

### 6.1 前置改动（fork 后第一件事）
1. 改 `applicationId`（`app/build.gradle.kts`）：`me.rerere.rikkahub` → `io.github.<你的账号>.<名字>`（避免与官方包冲突）。
2. 改应用名（`strings.xml`）。
3. release 签名：生成 keystore，写入 `local.properties`（或 gradle.properties），粗验用 `assembleDebug` 即可。
4. 删除/保留：`Firebase`（analytics/crashlytics）依赖若不想上报可移除（可选优化）。

### 6.2 数据库新增表（Room v24 → v25）
按 Room 规范：`Entity` → `DAO` → `AppDatabase.entities[]` + `abstract fun xxxDao()` + `version = 25` + `AutoMigration(from = 24, to = 25)`（只新增表，AutoMigration 可自动推断）。

新表（主键全部 String UUID）：

| 表 | 关键列 |
|---|---|
| `NoteEntity` | id(PK), content, status, createdAt, updatedAt, deleted |
| `TodoEntity` | id(PK), text, done, completedAt, status, createdAt, updatedAt, deleted |
| `DayNoteEntity` | id(PK), date, content, createdAt, updatedAt, deleted |
| `HabitEntity` | id(PK), name, icon, color, order, archived, frequencyType, timesPerWeek, daysOfWeek, createdAt, updatedAt, deleted |
| `HabitRecordEntity` | id(PK), habitId, date, status, count?, createdAt, updatedAt, deleted（索引 `[habitId+date]`） |
| `AlarmEntity` | id(PK), h, m, s, enabled, triggered, label, sound, date, lastTriggerKey, createdAt, updatedAt, deleted |
| `RadioStationEntity`（电台源，仅本地，不参与同步） | id(PK), name, url, order |

### 6.3 新增页面（完全照抄现有样板链）
以最小样板 `history` 模块为模板，新增页面链路：

```
① 加路由：RouteActivity.kt 的 sealed interface Screen 加 data object Screen.Notes 等
② 注册：entryProvider { entry<Screen.Notes> { NotesPage(...) } }
③ 建页：ui/pages/notes/NotesPage.kt + NotesViewModel.kt（koin 注入 DAO/Repository）
④ DI：di/ViewModelModule.kt 用 viewModelOf(::NotesViewModel) 注册
⑤ 入口：ChatDrawer.kt 的 DrawerActions 加"便签""待办""日历""打卡""电台"入口（可放一组/子分组）
```

页面规划（可合并成 1~2 个页面减少工作量）：
- **便签+待办页**（一个页两个 Tab，或分开）
- **日历页**（月视图 + 每日笔记：对齐 BB 的 `hub_day_notes` 按 `date` 存取）
- **打卡页**（习惯列表 + 今日打卡 + 统计）
- **提醒设置页**（闹钟列表 CRUD）

### 6.4 提醒/闹钟模块
- 新增通知渠道 `reminder`（HIGH，**注意：要新增，不要复用 chat 渠道**）。
- **精确提醒**：`AlarmManager.setExactAndAllowWhileIdle`，到点发通知（`NotificationUtil.notify` 复用）；权限：`USE_EXACT_ALARM`（Manifest + 运行时引导，Android 12+）。
- **普通提醒/打卡提醒**：WorkManager（依赖已就绪）。
- 闹钟启用/停用时注册/取消对应 Alarm；`lastTriggerKey` 防重复。

### 6.5 在线电台模块
- 依赖：Media3 `exoplayer` + `media3-session`（需在 `app/build.gradle.kts` 添加）。
- 前台服务：仿照现有 `ChatGenerationForegroundService` 新建 `RadioPlaybackService`（`MediaSessionService`），Manifest 声明 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限 + service（foregroundServiceType="mediaPlayback"）。
- 电台源：内置一批在线地址 + 支持用户增删（存 `RadioStationEntity`，仅本地）。

### 6.6 同步模块（手机端）
- **设置页**：S3（endpoint/bucket/accessKeyId/secretAccessKey/root）与 WebDAV（host/user/pass/path）配置输入（字段与 BB 一致，手动填同一套账号）。
- **引擎**：`SyncEngine`（Kotlin 单例）——上述 5.6 流程；复用 `S3Client` / `WebDavClient`；序列化用项目已有的 kotlinx.serialization / Moshi（跟随项目现状）。
- 触发：启动同步 + 手动按钮 + WorkManager 定时（可选）。
- 冲突记录：`lastSyncError` 展示在设置页状态栏。

### 6.7 权限清单（完整）
新增项加粗：
`INTERNET`（已有）· `POST_NOTIFICATIONS`（已有）· `FOREGROUND_SERVICE`（已有）· `FOREGROUND_SERVICE_DATA_SYNC`（已有）· **`USE_EXACT_ALARM`**（精确提醒）· **`FOREGROUND_SERVICE_MEDIA_PLAYBACK`**（电台后台播放）· （如做系统日历导出，已有 `READ/WRITE_CALENDAR` 可复用，本期不需要）

---

## 7. 电脑端适配器方案（cherry-studio-BB）

> 原则：**只新增，不改现有功能**；**严禁触碰 `BackupManager.ts`（v2 重构中）**。

### 7.1 数据层
- Dexie 升版 v13 → v14：hub 三表（`hub_notes/hub_todos/hub_alarms/hub_day_notes/hub_activity/hub_note_history`）加 `syncUuid` 索引列；`habits/habit_records` 已有 uuid id 可直接复用。老记录导出时懒生成并回写。

### 7.2 导出模块
- `src/renderer/src/services/SyncAdapter.ts`（新文件）：读上述表 → 组装 §5.2 规格的 JSON（含 manifest）→ 返回待上传内容。
- 复用现有序列化方式（JSON.stringify），不依赖备份 zip。

### 7.3 上传/下载
- 复用现有 S3/WebDAV 上传通道：`window.api.backup.*` 中与 S3/WebDAV 相关的 `put/get/list/delete`（主进程 `S3Storage` / `WebDav` 已有实现，仅需新增几个 IPC 通道或复用文件读写通道）。
- 目录固定 `cherry-rk-sync/`（与手机端约定一致）。

### 7.4 导入合并模块
- 下载文件柜 JSON → 按 §5.4 规则与 Dexie 本地合并 → 写回本地库。

### 7.5 触发与 UI
- 设置页 `DataSettings` 内新增一个 **"跨设备同步（便签/待办/日历/打卡）"** 区块：通道选择（S3/WebDAV/关）、复用现有配置账号、同步间隔（复用 `startAutoSync` 定时器）、手动"立即同步"按钮、状态显示。
- 独立于现有"备份/恢复"功能，互不干扰。

### 7.6 与 v2 重构的共存策略
- 新模块**不 import 不修改**被废弃的 `BackupManager.ts`；若需文件客户端复用，改走 `S3Storage`/`WebDav` 的新入口或另建轻量封装，减少冲突面。

---

## 8. 分阶段实施步骤（含细节与验证）

> 每阶段完成标准 = 该阶段"验收"全部打勾。粗验全部用 `assembleDebug`，最终出 `assembleRelease` 通用 APK。

### 阶段 0：环境准备（用户 Windows 机）⭐ 必须第一位
| 步骤 | 细节 |
|---|---|
| 装 JDK 17 | 安装 Temurin/OpenJDK 17，配 `JAVA_HOME` 与 PATH |
| 装 Android Studio | Ladybug 或更新版本；SDK Manager 装 **Android 15/16（API 35~37）** Platform 与 Build-Tools |
| 克隆 | `git clone` 本项目（用户 fork 的 RikkaHub）与 cherry-studio-BB |
| 签名 | `keytool -genkeypair -v -keystore rk.jks -alias rk -keyalg RSA -keysize 2048 -validity 36500`（记好密码，写入 `local.properties`） |
| 真机 | 手机开"开发者选项 → USB 调试"，或用模拟器（API 26+） |
| 验证 | `./gradlew assembleDebug` 首次构建成功；`adb devices` 能见设备 |
| 验收 | ☐ 首次构建出 debug APK 并可安装到手机 ☐ Android Studio 能打开工程 |

### 阶段 1：fork 基础改造（跑通自己的包）
| 步骤 | 细节 |
|---|---|
| 改包名 | `app/build.gradle.kts` 的 `applicationId` 与 `namespace` 同步改 |
| 改应用名 | `strings.xml` 的 app_name |
| 清理 | （可选）移除 Firebase 依赖与初始化（`RikkaHubApp` 中） |
| 验收 | ☐ `assembleDebug` 通过 ☐ 手机安装后应用名正确、能进 AI 对话 ☐ 配置一个 API Key 能正常对话/生图（**先确认 AI 链路在白嫖后依然通**） |

### 阶段 2：效率功能（便签/待办/日历/打卡）
| 步骤 | 细节 |
|---|---|
| Room v25 | 新增 §6.2 的 6 张同步表 + `AutoMigration(24→25)`；`assembleDebug` 升级安装不崩 |
| 页面 | 照样板链加 `NotesPage/TodoPage/CalendarPage/HabitsPage` + 抽屉入口 |
| 本地 CRUD | 各页增删改查 + 软删除（deleted 标记） |
| 验收 | ☐ 四功能可正常增删改查 ☐ 重启 APP 数据仍在 ☐ 旧库（v24）升级到 v25 不丢数据 |

### 阶段 3：提醒 + 在线电台
| 步骤 | 细节 |
|---|---|
| 提醒 | 新增 `reminder` 通知渠道；AlarmManager 精确闹钟 + `USE_EXACT_ALARM` 权限引导；闹钟 CRUD |
| 电台 | 加 Media3 依赖；`RadioPlaybackService` 前台服务 + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`；电台列表页 + 播放/暂停 |
| 验收 | ☐ 设 1 分钟后的提醒，**锁屏/切后台**下到点弹通知 ☐ 电台在后台/锁屏持续播放 ☐ 权限弹窗流程正常（Android 12+ 与 14+ 都要测） |

### 阶段 4：手机端同步引擎
| 步骤 | 细节 |
|---|---|
| 设置页 | S3/WebDAV 配置输入 + 手动同步按钮 + 状态显示 |
| 引擎 | 导入/导出/合并（§5.4 规则）+ 启动自动同步 |
| 单测 | 对合并规则写单元测试（新增/同 id 后改者赢/删除标记/首同步） |
| 验收 | ☐ 用一个真实 WebDAV（如坚果云）或 S3 账号：手机 A 建便签→同步→文件柜出现 notes.json ☐ 内容与 §5.2 schema 一致 ☐ 删除后远端也置 deleted |

### 阶段 5：BB 适配器
| 步骤 | 细节 |
|---|---|
| Dexie v14 | hub 表加 `syncUuid` 列，升级不丢数据 |
| SyncAdapter | 导出/导入/合并（与手机端同一规格） |
| 上传下载 | 复用现有 S3/WebDAV 通道 + 定时触发 + 手动按钮 |
| 验收 | ☐ BB 同步后文件柜内容与手机端格式完全一致（字段级比对） ☐ 电脑改待办→同步→手机看到 ☐ 不碰 BackupManager（git diff 仅新增文件/新增块） |

### 阶段 6：端到端联调
| 步骤 | 细节 |
|---|---|
| 双通道 | WebDAV 全流程一遍，S3 全流程一遍 |
| 双向 | 两端各建/改/删几条，同步后结果一致（以更新时间为准） |
| 冲突 | 两端同时改同一条→后改者胜；两端同时新建→都保留 |
| 首同步 | 清空一端数据再同步→数据完整恢复 |
| 验收 | ☐ 全流程清单 §9 全部 ☐ 连续 3 天日常使用无数据丢失 ☐ release APK 签名安装正常 |

---

## 9. 验收总清单（checkbox）

### A. 构建/安装
- [ ] 阶段 0 环境验收通过
- [ ] `assembleDebug` / `assembleRelease` 均成功
- [ ] 通用 APK 安装到目标手机（Android 8.0+ 实机）
- [ ] 应用名/图标正确，包名非官方包名

### B. AI 功能（白嫖确认）
- [ ] AI 对话（流式）正常
- [ ] AI 图片生成正常

### C. 效率功能
- [ ] 便签 增/删/改/归档
- [ ] 待办 增/改/勾选/归档
- [ ] 日历每日笔记 按月读写
- [ ] 打卡 习惯管理 + 每日打卡 + 统计
- [ ] 重启/升级安装数据不丢（Room v24→v25 迁移）

### D. 提醒/电台
- [ ] 精确提醒：锁屏/后台到点弹通知（Doze 下测试）
- [ ] 闹钟权限引导流程（Android 12+）
- [ ] 电台后台/锁屏持续播放，通知控制条正常

### E. 同步（重点）
- [ ] WebDAV 通道：两端双向同步一致
- [ ] S3 通道：两端双向同步一致
- [ ] 新建记录跨端可见（syncId 不冲突）
- [ ] 同条记录后改者胜
- [ ] 删除跨端生效（软删除）
- [ ] 首次同步（一端空库）完整恢复
- [ ] 手机启动自动同步 + 手动按钮 + （可选）定时
- [ ] BB 同步设置独立于备份设置，互不干扰
- [ ] BB 端 git diff 不触碰 `BackupManager.ts`

### F. 开源合规
- [ ] fork 仓库保留原 LICENSE（AGPLv3）与版权声明
- [ ] README 注明：基于 RikkaHub 改造 + 原项目链接
- [ ] 已发布到用户自己的 GitHub（公开）

---

## 10. 风险与注意事项

| 风险 | 等级 | 对策 |
|---|---|---|
| 安卓后台限制（Doze/厂商白名单）可能延迟提醒 | 中 | 精确提醒走 AlarmManager + 引导用户加电池白名单；普通提醒允许延迟 |
| 首次同步量大使合并慢 | 低 | 全量 JSON 按表合并，个人数据量（千级）毫秒级完成 |
| S3/WebDAV 账号填错导致同步失败 | 低 | 设置页做"测试连接"按钮 + 错误提示 |
| AGPLv3 开源义务 | 低 | 已接受：fork 公开 + 保留 LICENSE |
| 上游不合并 = 无官方更新 | 低 | 自主维护（用户已决策）；关键安全修复可手动 cherry-pick（可选） |
| 手机本地时间被改导致时间戳错乱 | 低 | 提醒触发用 AlarmManager 系统对齐；同步冲突以 updatedAt 为准，极端情况手动纠偏 |
| 双通道同时配置打架 | 中 | UI 设计为二选一（S3 或 WebDAV），不同步双写 |

---

## 11. 关键文件索引

### RikkaHub 侧（改造触及）
| 文件 | 用途 |
|---|---|
| `app/build.gradle.kts` | 包名/依赖/SDK/签名 |
| `app/src/main/AndroidManifest.xml` | 权限、前台服务声明 |
| `app/src/main/java/me/rerere/rikkahub/RikkaHubApp.kt` | 通知渠道 |
| `app/src/main/java/me/rerere/rikkahub/RouteActivity.kt` | 路由注册（`Screen` sealed interface + `entryProvider`） |
| `app/src/main/java/me/rerere/rikkahub/data/db/AppDatabase.kt` | Room 版本与表注册 |
| `app/src/main/java/me/rerere/rikkahub/data/db/entity/*.kt`、`dao/*.kt` | 实体与 DAO 样板 |
| `app/src/main/java/me/rerere/rikkahub/data/sync/s3/S3Client.kt`、`data/sync/webdav/WebDavClient.kt` | **同步复用：文件级上传下载** |
| `app/src/main/java/me/rerere/rikkahub/data/sync/S3Sync.kt` | 整库备份参考（不沿用，仅参考） |
| `app/src/main/java/me/rerere/rikkahub/utils/NotificationUtil.kt` | 通知工具 |
| `app/src/main/java/me/rerere/rikkahub/ui/pages/history/` | 页面样板 |
| `app/src/main/java/me/rerere/rikkahub/ui/pages/chat/ChatDrawer.kt` | 抽屉入口 |
| `app/src/main/java/me/rerere/rikkahub/di/*.kt` | Koin 注册 |

### BB 侧（适配器新增/触及）
| 文件 | 用途 |
|---|---|
| `src/renderer/src/databases/index.ts` | Dexie v13→v14 加 `syncUuid` |
| `src/renderer/src/services/SyncAdapter.ts`（新建） | 导出/导入/合并 |
| `src/renderer/src/pages/settings/DataSettings/` | 新增"跨设备同步"区块 |
| `src/renderer/src/services/BackupService.ts` | 复用 startAutoSync 定时（只读或加扩展） |
| `src/renderer/src/types/index.ts` | S3Config/WebDavConfig 复用 |

> ⚠️ 任何情况不修改 `src/main/services/BackupManager.ts`（标记废弃、v2 重构中）。

---

## 12. 执行顺序总览（一句话）

**阶段 0 环境 → 1 改包跑通 AI → 2 效率功能 → 3 提醒电台 → 4 手机同步 → 5 BB 适配器 → 6 联调验收 → 开源发布。**