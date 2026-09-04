# Changelog

本项目所有值得记录的变更都会记录在该文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.8.3] - 2026-09-04

### 核心主题：桌面助手剪贴板挂件（历史/收藏/多类型）+ 侧边栏与主题体验升级 + 全仓审查修复

**1. 桌面助手新增第 5 个视图：剪贴板历史（轻量剪贴板工具，复用挂件窗口，零新增进程）**

- 后台常驻监听剪贴板变化（主进程轮询，内存/CPU 占用可忽略），窗口开关不影响记录，随时呼出历史都是全的
- 每条记录自动带**复制时间戳**（列表右侧 `MM-DD HH:MM`）与**类型识别**（文本/色号/富文本/图片/文件路径）
- 支持拖动窗口边框调整大小，位置/大小按视图独立记忆；点击条目一键复制回系统剪贴板，手动 Ctrl+V 粘贴

**2. 剪贴板五项核心功能（按需求逐条落地）**

- **收藏**：每条消息「★收藏」键（固定在「钉」键左侧），点击即收藏/取消；收藏的消息是最高优先级保护对象
- **收藏夹切换**：右下角「收藏夹」键，点一下只显示收藏、再点恢复全部，按钮文案随状态切换
- **清空（带确认）**：收藏夹键右侧「清空」键，弹出确认/取消两个键；确认后**只删除未收藏的消息**——★收藏的消息永不会被清空删除（弹窗文案明示）
- **时间戳 + 容量限制**：自动记录复制时间；「上限」设置面板可配**保留条数 + 保留天数**双上限（默认 500 条 / 30 天），防历史无限膨胀占用磁盘；收藏条目不参与任何清理
- **多数据类型**：纯文本、十六进制色号（#RGB/#RRGGBB/#RRGGBBAA，色块展示，点击复制色值）、富文本 HTML（完整保留原文可回贴格式）、RTF（完整保留）、图片（**原件完整保留** + 预览缩略图双文件，点击复制回原图）、文件/文件夹复制路径（Windows CF_HDROP）

**3. 侧边栏体验升级**

- 移除设置键下方的「桌面助手」按钮（改为仅快捷键呼出，界面更简洁）
- 底部【小程序/效率助手/打卡/知识库/AI助手】五个功能键支持**鼠标按住拖动换位**，顺序即时持久化，与「显示设置→侧边栏设置」共享同一份配置

**4. 主题系统扩展与跟随修复**

- 新增「米白」「白灰」两款**护眼浅色主题**（暖米色/冷灰白低饱和配色，正文对比度约 10:1，久看不累），主题选择器自动出现
- 修复桌面助手小窗主题色不跟随/恢复默认绿色的问题：主进程缓存最新主题 token，挂件创建即补发；挂件端启动主动拉取；后台窗口 rAF 被系统节流时以 setTimeout 兜底，三重保障

**5. 挂件窗口控制补齐**

- 顶栏新增「最大化/还原」按钮（无边框窗口系统级 maximize，自动铺满工作区并记忆还原位置）；切视图时自动先还原再应用视图尺寸，避免状态串扰

**6. 代码质量审查与修复（2026-09-04 全仓审计）**

- 修复：色号检测缺 `^` 锚点导致 URL（如 `https://x/#abc`）误判为色号（补回归测试锁定）
- 修复：剪贴板设置弹窗 CSS 遗留孤立 `}` 导致全量构建失败的隐患
- 修复：RTF 条目搜索弱匹配（输入单字母即命中全部 RTF）
- 上限设置弹窗改为弹性比例布局（输入框随窗口缩放自适应，不再超出界面）
- 清理全仓库 4 处 import 排序违规；恢复误删的 `APK开发方案.md`

## [1.8.1] - 2026-09-02

### 核心主题：知识库「三栏式智能工作台」UI 重构 + 重排模型（Rerank）+ 全仓过度工程清理

**1. 知识库详情页彻底重构（大屏全屏自适应，告别留白与四栏挤压）**

旧版四栏（知识库/文件/查询/内容）在大屏最大化时右侧大片留白、文件一两个时中间空旷难看。重构为**现代化三栏工作台**：

- **左侧**：知识库导航（模型标识、悬停删除确认、新建入口）
- **中间主舞台（Flex 撑满大屏）**：「智能语义召回调试工作台」——沉浸式提问框（Enter 快速检索、Shift+Enter 换行）→ 召回命中卡片列表（相似度百分比、来源页码/行号）→ 右侧**全景全文阅读器**（大字号、1.8 行高、一键复制、选中态高亮）
- **右侧（340px 固定）**：「文档资产抽屉」——导入文件/文件夹、刷新、就绪数/切块数/体积统计胶囊、按文件名实时过滤、紧凑文件卡片（格式专属彩色图标、处理状态、切块数），文件多少都不显空旷
- 新增**智能检索沙箱引导空态**（展示库模型信息与三步上手指引）；头部参数徽标实时展示切块/重叠/TopK/重排模型

**2. 新功能：重排模型（Rerank）可选，检索相关性显著提升**

- 模型服务中所有被识别为重排类型（`isRerankModel`）的模型，可在**新建知识库弹窗**（可选预选）与**知识库设置**（可随时更换、即时生效）中选择
- **检索链路**：BM25 + 向量双路 RRF 融合（候选池扩大 2 倍）→ 调用 OpenAI 兼容 `/rerank` 端点交叉编码精排 → 取 TopK
- 重排失败/无配置时**自动降级为 RRF 结果**，绝不阻断检索；清空选择即可关闭重排
- 支持 jina / qwen / cohere / dashscope 等 OpenAI 兼容 rerank 端点（Bearer 鉴权、60s 超时、响应双格式兼容）

**3. 过度工程清理（ponytail 全仓审计 + 修复）**

- `SearxngProvider` 移除 `@agentic/searxng` + `ky` 两个依赖，改为直连 axios（同文件曾 axios/ky 混用；顺带补 15s 搜索超时、URL 缺失防御、`basicAuthPassword` 类型收窄）
- 删除自研死文件扫描脚本 `scripts/find-dead-files.mjs`（正则误报率高，误判 24 个配置/声明文件；由 `tsgo noUnusedLocals` + 人工 review 替代）
- 清理 `filters.ts`（整段注释残留的 `getGroupedMessages` 副本 + 过时 import 注释 + 合并 lodash import）、`MessageWebSearch.tsx`（注释掉的死组件）
- `docs/OVERENGINEERING_REVIEW_2026-08-28.md` 同步标注脚本移除原因

**4. 代码审查（code review）修复**

| 问题 | 修复 |
|---|---|
| Dexie `update()` 跳过 `undefined` 属性，清空重排模型后旧值残留、重排仍生效 | 显式传入的重排字段归一化为空串 `''`（可正常写入覆盖），创建时同步 `?? ''`，与 `makeRerankModel` falsy 检查全链路闭环 |
| 新建知识库弹窗取消后 state 残留上次输入 | `onCancel` 时清空名称/嵌入模型/重排模型 |

## [1.7.3] - 2026-08-31

### 核心主题：修复生图助手「新建会话后无法生图 / 生成结果不可见」+ 全功能链路代码审计加固

**1. 根因修复：生图助手新建会话后生成结果看不见（P0）**

现象：新建会话后无法在其中生图；强行删除后仍看不到新图，但图片确实已生成并自动保存到默认目录。

根因是 **`HomePage` 把 assistant 整个对象存进了 `useState`，成为永不刷新的快照**：`addTopic` / `removeTopic` 经 Immer 会换掉 store 中的对象引用，快照的 `topics` 永远停在挂载那一刻；而 `PaintWorkspace` 恰恰用 `assistant.topics` 做会话归属守卫，于是新建的话题一律被判为「不属于本助手」。

```
新建话题 → Redux 已有、快照没有 → 守卫判定不属于本助手 → validTopicId = null
        → 内容区空态 + 输入区 topicId=null → 每次生成都再建一个孤儿话题
        → 图片照常落盘（回调与 UI 无关）→ 用户在当前会话里永远看不到
```
「历史列表能看到、点进去却空白」也由此而来——列表组件此前已自行回 Redux 取数，两个数据源不一致。

- **根治（B）**：`HomePage` state 只存 `activeAssistantId`，`activeAssistant` 改用 `useMemo` 从 Redux 派生；模块级缓存拆为 `_activeAssistantId` / `_activeAssistant`（后者仅作删除兜底）。
- **防御（A）**：新增共享约定 `hooks/useAssistant.ts` —— `resolveLiveAssistant`（纯函数）/ `useLiveAssistant`（hook 版）/ `resolveValidTopicId`（会话归属守卫，两个 Workspace 共用）。`PaintWorkspace`、`VideoWorkspace`、`AutomationWorkspace.RecordsView` 及两个历史列表统一改用实时助手。

**2. 顺带修掉：会话记录缺失时内容区永远转圈**

`PaintContent` / `VideoContent` 把 `!data` 一律当加载态渲染 `<Spin>`，但 `useLiveQuery` 首屏返回 `undefined`（真加载中）、查询结果为 `null`（**库中已无此会话**）。已拆分为 `data === undefined`（转圈）与 `data === null`（提示「会话不存在或已被删除」）。

**3. 全功能链路代码审计加固（`/code-review` 严格审计）**

| 问题 | 说明与修复 |
|---|---|
| **生成期间新建话题会吞掉结果**（4 处） | `PaintInputbar` / `PaintHistoryList` / `VideoInputbar` / `VideoHistoryList` 的 `handleCreateNewTopic` 均无 `isGenerating` 守卫。按钮虽 `disabled`，但 **`new_topic` 快捷键走同一入口、绕过了禁用**；切到新会话后在途结果仍写回旧会话，表现与本次 P0 完全一致。四处统一加拦截，两个「+」按钮加 `disabled` + 置灰 |
| **视频 `isGenerating` 无法跨组件共享** | 原为 `VideoInputbar` 局部 state，历史列表拿不到 → 提升到 `VideoWorkspace` 以 props 下发（生图侧本就走 Redux `paint.isGenerating`，无需改造） |
| **删除会话时造幽灵话题**（2 处） | 两个历史列表的 `handleDelete` 用 `getDefaultTopic()` 生成随机 id 话题（不在 db、不在 Redux），还会往 `newMessage` slice 写入永远清不掉的 topicId。改为从**剩余 topics** 挑下一个；没有剩余则不动 `activeTopic`，交给归属守卫判空态。两处同时补 `try/catch` + 错误 toast |
| **自动化工作台 5 处浮空 Promise** | `toggleEnabled` / `runNow` / `duplicate` / `remove` / `TaskForm.onSave` 均为 `void xxx()` 且无 `try/catch`，IPC 失败 = 未处理 rejection + 零反馈。全部补 `logger.error` + `message.error` |
| toast 配置字段 | `window.toast.error` 的正文项是 `description` 而非 `message`（`components/TopView/toast.tsx` 的 `ToastConfig`） |

**4. 审计中核实为「不是 bug」、避免误改的项**

图生图 UI 显示「1 张」而 `batchSize` 仍为 4（`fetchPaintGeneration` 走 `editImage` 分支，不传 batchSize，实际就是 1 张）；`videoService.onStatus` 整体覆盖 `metadata`（生成期只有 `progressText`，无损失）；`saveImageToDirectory` 不注册进内部 FileStorage（不重复占存储）；`persistRemoteImages` + `saveGeneratedImages` 不重复保存。

**5. 文档与测试**

- 新增回归测试 `src/renderer/src/pages/paint/__tests__/workspaceTopicGuard.test.ts`（8 用例，用**真实 reducer** 驱动纯函数守卫：新建放行 / 快照拒绝 / 连续新建 / 删除收缩 / 边界）。
- 开发者文档新增 `docs/wiki/06-数据存储与状态管理.md §6`「状态陷阱：assistant 快照 vs Redux 实时对象」，把上述约定写成强制规范；同步更新 `docs/wiki/04-渲染进程模块.md`。

**6. 质量验证**

- Vitest：renderer **174 个测试文件 / 2892 个测试全部通过**；shared 89、aiCore 360 全通过；main 25/26 文件通过（7 个 filesystem 用例失败为沙箱 `safe-delete` 对 `fs.rm` 的拦截，已用 `git stash` 在干净工作区复跑确认为**改动前既有**，main 项目只含 `src/main/**` 与本次改动无交集）。
- TypeScript Main / Web 全量类型检查零错误；Biome 格式与 lint、ESLint、oxlint 对全部改动文件 0 error。

## [1.7.2] - 2026-08-29

### 核心主题：打卡 TAB「自然年统计」新模块 + 打卡页排版与 UI 重设计 + 全仓代码审计加固

**1. 新功能：打卡「自然年统计」模块（按习惯 · 按自然年）**
- 统计视图新增【自然年统计】内容框（原「年度热力图」模块已移除）：名字栏 = 模块名 + 年份切换（创建年→今年，默认今年）+「共打卡 N 天」；下方为选中习惯的**整年 365/366 天 GitHub 风格热力图**。
- 习惯 chips 按 order 排序，点击即切换该习惯的年度热力图与计数；未满的自然年按今天截断（如 8 月 29 日统计 1/1~8/29，共 241 天），完成率分母沿用「跳过日不算应打卡日」口径。
- 格子三态：打卡 = 习惯主题色深格、跳过 = 同色浅格、未打卡 = 空白；今天加描边；鼠标悬停显示「8月2日 · 已打卡」。
- 数据层新增纯函数（`pages/habits/services/stats.ts`）：`yearWindow` / `yearlyCheckinStats` / `yearlyHeatCells`，组件禁止自算口径；TDD 交付，新增 11 个纯函数测试（闰年 366 格、年中创建、未满年截断、创建前空窗口、12-31 边界、skip 排除）+ 5 个组件测试。

**2. 打卡页排版与 UI 重设计**
- 趋势图重做：由「一根裸折线」升级为渐变面积填充 + 25/50/75 参考虚线 + 当日完成率标注。
- 完成率对比条增加表头（习惯 / 完成率 / 强度），修复强度指数列无说明的裸数字问题。
- 文字排版成体系：区块标题统一 eyebrow 风格（12px/600/字距/弱色），大数字统一行高与 tabular-nums。
- 防挤压修复：指标卡 `repeat(4, minmax(0, 1fr))`、热力图格子最小 14px + 窄窗横向滚动（原先 53 列会被压成细丝）。
- 细节：返回按钮胶囊化、月份标题两段式（年小月大）、「回到今天」仅非当前月显示、星期分布图卡片化 + 100% 基准虚线、习惯管理列表色点前置。

**3. 全仓代码审计加固（`/code-review` 严格审计）**
- **React Hooks 规则违规修复**：热力图 memo 化时一度把 `useMemo` 置于条件 return 之后，二次审查自抓并修正为全部 hooks 无条件调用。
- **memo 失效修复**：`allRecords.get(id) ?? { 新建 Set }` 每次渲染产生新对象，导致依赖它的 useMemo 每帧重建 366 格 → 改为模块级 `EMPTY_SETS` 单例。
- **浮空 Promise**：`ShortcutService` 截图快捷键补 `void`；`scripts/screenshot-smoke.js` 补 `.catch` 拒绝处理。
- **lint 配置根因修复**：`no-unused-vars` 开启 `varsIgnorePattern`/`argsIgnorePattern: '^_'`（下划线前缀 = 有意忽略的既有约定），消除 3 处误报 → **oxlint 由 5 警告降至 0 警告 0 错误**。
- 清理死导出 `monthTitle`（连带测试）；核查确认 10 个运行时依赖全部在用、无死文件、定时器与事件监听清理正确、Dexie v13 表结构与索引正确。

**4. 质量验证**
- Vitest：renderer 173 个测试文件 / 2884 个测试全通过；shared、aiCore 全通过；main 303 通过（7 个 filesystem 用例失败为沙箱 safe-delete 环境拦截，与代码无关）。
- TypeScript Main / Web 全量类型检查零错误；Biome 格式与 Oxlint 静态检查全绿。

## [1.7.1] - 2026-08-28

### 核心主题：全仓深度过度设计审查与瘦身重构（Ponytail Review & Audit）+ 原生化升级

**1. 手写包装原生化与标准库对齐**
- **UUID 生成原生化**：移除冗余的 `uuid()` 工具包装，全仓统一直接调用现代 Web/Node.js 原生标准 `crypto.randomUUID()`，调用链减少一层间接，执行效率更高。
- **对象属性判断原生化**：移除手写 `hasObjectKey()` 包装函数，全面迁移至 ECMAScript 原生 `Object.hasOwn()`。
- **延迟函数内联简化**：移除 `delay()` 手写封装，直接使用内联 `new Promise(resolve => setTimeout(resolve, ms))`，毫秒粒度更直观。
- **类名合并规范化**：移除 `classNames = clsx` 别名层，全仓组件统一直接 `import { clsx } from 'clsx'`。

**2. 核心服务脱离第三方冗余依赖（fs-extra 彻底剥离）**
- **原生 fs 升级**：`src/main/services/BackupManager.ts`（备份管理器）全面迁移至 Node.js 原生 `node:fs/promises` 与 `node:fs`。
- **依赖瘦身**：彻底从 `package.json` 及 `pnpm-lock.yaml` 移除 `fs-extra` 与 `@types/fs-extra`。
- **孤儿依赖清理**：清理无代码引用的 `react-player` 与 `tsx` 孤儿包。

**3. 全仓死代码深度清理（净减 1000+ 行）**
- **死逻辑/无用导出剔除**：删除 `formatPrivateKey`（83行）、`formatAzureOpenAIApiHost`、重复的 `getErrorMessage`、未调用的 `clearAllQueues`/`getTopicPendingRequestCount`、仅测试引用的 `getIntersection`、`updateFileCounts` 方法链、`getFileContent`、`getRawTopic`、废弃的 `Navbar.tsx`、死 barrel 桶文件等。
- **TopView 弹窗死字段清理**：移除全仓 26 处无读取的 `static topviewId = 0` 死字段。

**4. 重复架构合并与多窗口启动规范化**
- **弹窗家族重构**：`BackupPopup` 与 `RestorePopup` 深度合并为 `BackupRestorePopup.tsx`；`SearchPopup`、`TextFilePreview` 改为基于 `GeneralPopup` 的轻量化呈现，消除数百行样板代码。
- **多窗口引导统一**：抽象 `src/renderer/src/windows/bootstrap.ts`，统一多子窗口的 Keyv 初始化、Store 同步订阅与 Provider 容器。
- **错误与失败响应统一**：`BaseFileService` 统一收口 7 处失败响应模板；`FmRadio` 统一复用 `dedupStationsByUrl`。

**5. 严格质量与回归验证**
- 全仓 214 个测试文件、3644+ 单元与集成测试全部 100% 通过。
- Main 进程与 Web 渲染进程 TypeScript 类型检查零错误，Biome / Oxlint 规则全绿。

## [1.7.0] - 2026-08-27

### 核心主题：全新「习惯打卡（Habit Tracker）」TAB 工作台

- 详见 `release-notes-1.7.0.md`。


## [1.6.3] - 2026-08-26

### 核心主题：动感视频助手全面打通三家厂商 + 视频结果可复制/可下载/自动保存

**1. 新功能：添加提供商内置「视频生成」商家模板**
- 「添加提供商 → 提供商类型」下拉新增三项：`阿里云百炼 · 视频生成`、`火山豆包 · 视频生成`、`腾讯混元 · 视频生成`
  （内部统一以 openai 类型存储，不新增 ProviderType，零迁移成本）。
- 选中即自动预填服务商名称与官方 API 接入点（百炼 `dashscope.aliyuncs.com` / 火山
  `ark.cn-beijing.volces.com/api/v3` / 腾讯 `vclm.tencentcloudapi.com`），创建后仍可在设置页自行修改地址；
  表单下方实时显示该家的密钥格式提示（如腾讯的 `SecretId:SecretKey` 冒号格式）。

**2. 修复：腾讯混元视频接口参数全面过期（此前必然调用失败）**
- 按官方现行文档逐项核对并修正：域名 `hunyuan.tencentcloudapi.com` → `vclm.tencentcloudapi.com`；
  Action `SubmitHunyuanVideoJob/QueryHunyuanVideoJob` → `SubmitHunyuanToVideoJob/DescribeHunyuanToVideoJob`；
  Version `2023-09-01` → `2024-05-23`；补必填公共参数 `X-TC-Region`（默认 `ap-guangzhou`）。
- 提交/轮询字段对齐：返回 `TaskId` → `JobId`，状态 `Done/Fail/Processing` → `DONE/FAIL/RUN/WAIT`，
  结果 `VideoUrl` → `ResultVideoUrl`；图生视频图片字段改为官方 `Image: { Url | Base64 }` 结构。
- TC3 签名模块支持可选 region：仅附加 `X-TC-Region` 头，不参与签名计算（固定向量测试保持不变）。

**3. 修复：阿里云百炼视频生成的分辨率大小写与万相 3.x 双协议适配**
- resolution 档位自动归一化为大写 P（对话框 `720p` → 百炼要求的 `720P`），消除 `Input should be '1080P'...` 报错。
- 按模型代际路由请求协议：wan2.x-t2v/-i2v、wanx 系列沿用 `input.img_url`；wan3.x 全能参考系列改用
  `input.media` 数组（上传首帧图自动转为 `{ type: 'first_frame', url }`），并接入 `parameters.ratio` 宽高比。
- 服务端要求素材（`Field required: input.media`）时不再盲目去参重试，直接给出中文操作提示：
  「wan3.x 为参考生视频模型需上传图；纯文生请用 wan2.x-t2v 系列」。

**4. 改进：视频页模型选择移除命名白名单**
- 删除按模型名正则过滤的白名单（`config/models/video.ts` 及其 `isVideoModel`）：视频模型命名无统一规范，
  白名单会漏掉新模型（如 `wan3.0-video`）。现在用户添加的全部模型均可在视频页选择，选错模型时生成入口报错提示。

**5. 新功能：视频结果操作栏（复制 / 另存为 / 定位文件）+ 自动保存可见化**
- 生成成功的视频卡悬浮显示三个操作：复制视频链接、另存为…（系统保存对话框）、打开所在文件夹。
- 消息 metadata 补充记录 `fileName/filePath`，支撑另存与定位。
- 自动保存到「设置 → 图片保存路径」目录的结果改为 toast 明示（成功含目标路径，失败提示手动另存），
  不再静默吞掉失败。

### 测试与验证
- 相关测试 23 个文件 1064 用例全部通过；改动文件 TypeScript 类型检查零错误。

## [1.6.0] - 2026-08-22

### 核心主题：桌面助手快捷键 + 全仓死代码清理与启动/内存性能优化

**1. 新功能：桌面助手全局快捷键（默认 `Alt + ~`）**
- 设置 → 快捷键新增「桌面助手」条目，与其他快捷键一致支持自定义录入、单行重置、清除、启停开关、全量重置。
- 主进程注册为 **universal 快捷键**（`UNIVERSAL_SHORTCUT_KEYS`），主窗口失焦时仍可全局呼出/隐藏桌面助手挂件；
  handler 复用 `windowService.toggleMusicWidget()`（与托盘/设置页开关同一入口）。
- 老用户升级自动生效：redux-persist rehydrate 后 `mergeDefaultShortcuts()` 自动补入新条目，无需手动迁移。
- 新增单测：默认值断言（`['Alt', '`']` / editable / system）+ `convertShortcutFormat` accelerator 转换。

**2. 死代码清理（约 -700 行）**
- 删除零引用文件：`packages/shared/config/providers.ts`（5 个导出全仓无引用）、`packages/shared/anthropic/__tests__/index.test.ts`
  （随 `getSdkClient` 一并删除）、重复启动脚本 `start.cmd`（与 `start-dev.bat` 逐字节相同）、空目录
  `resources/binaries/win32-arm64`（项目仅面向 win-x64）。
- 删除 `getSdkClient()` 及其 OAuth 分支（`packages/shared/anthropic/index.ts` 172→63 行，生产代码仅用
  `buildClaudeCodeSystemMessage`）。
- 删除渲染层死 prompt（`config/prompts.ts` -330 行）：`AGENT_PROMPT`、`SUMMARIZE_PROMPT`、`SEARCH_SUMMARY_PROMPT`、
  `SEARCH_SUMMARY_PROMPT_KNOWLEDGE_ONLY`、`FOOTNOTE_PROMPT`、`WEB_SEARCH_PROMPT_FOR_ZHIPU/OPENROUTER`（含连带 dayjs import）。
- 删除其他零引用符号：`fetchNoteSummary`、`fetchAllActiveServerTools`（ApiService）、`selectActiveTodoInfo`+
  `ActiveTodoInfo`（messageBlock）、`SimpleFieldInputTool`、`hasTokenLanYunToken`、`hasBailianToken`、
  `deleteMessageFiles`、`moveProvider`、`isModernSdkSupported`、3 个 `is*Block` 类型守卫、`isThinkModelType`、
  `isServiceTier`、`isAwsBedrockAuthType`、`MdiLightbulbOn10`、`ZHIPU_RESULT_TOKENS`、`NOT_SUPPORTED_RERANK_PROVIDERS`、
  `ONLY_SUPPORTED_DIMENSION_PROVIDERS`、`builtinLangCodeList`、`validateMcpConfig`、`safeValidateMcpServerConfig` 等。
- 收紧可见性：`messageThunk.ts` 的 4 个文件内辅助函数去掉多余 `export`。
- 清理 `renderer/utils/api.ts` 的"向后兼容"re-export 层：6 个消费方改为直接从 `@shared/utils` /
  `@shared/aiCore/provider/utils` 导入；`hasAPIVersion`/`withoutTrailingSharp`/`formatAzureOpenAIApiHost` 确认全仓
  零消费者后随层删除。

**3. 性能优化：按需加载重组件（首屏 JS 与主进程常驻内存双降）**
- **`@e965/xlsx`（7.8MB）**：由 Markdown Table 静态链进首屏 bundle → 改为点击导出时 `await import`，
  空表格提前返回不触发加载。
- **rehype-mathjax（mathjax-full ~37MB 源码）**：与 KaTeX 双引擎原先同时静态加载 → 改为用户切换到 MathJax
  时才懒加载（useState+useEffect 预载）；默认 KaTeX 引擎保持静态，零延迟不受影响。
- **@aws-sdk/client-s3**：原经 `ipc.ts → BackupManager → S3Storage` 静态链在主进程启动即常驻 → S3Storage 重构为
  SDK 懒加载（模块级单例 Promise + `getClient()` 延迟创建 client），构造签名不变、BackupManager 6 个调用点零改动；
  未配置 S3 备份的用户完全不再加载该 SDK。
- **docx**：ExportService 顶层静态 import → 仅导出 Word 时动态加载（转换函数改为接收 docx 模块参数）。
- **music-metadata**：MusicService 静态 import → 读元数据时动态 import。

### 依赖治理（-2 直接依赖，lockfile -78 包）
- 移除 `react-player`：`MessageVideo` 仅用到 src/controls/currentTime/onReady，原生 `<video>` 元素全覆盖
  （onLoadedMetadata 在 src 变化时会重新 seek，行为比 react-player 单次 onReady 更正确）。
- 移除 `tsx`：无任何 script/文档/配置引用（vitest 依赖树内的 tsx 为独立 peer 解析，不受影响）。
- 复核确认保留：`pako` 在 devDeps 是打包契约（仅 renderer 使用、vite 内联；main 进程 external 仅限 dependencies 区）；
  dotenv/dotenv-cli 各有用途；全部 @types/* 均有真实消费。oxlint/eslint/biome 三工具分工明确非冗余。

### BUG 修复
- **修复 S3 懒加载失败缓存导致的永久失败**：动态 import 或 S3Client 构造失败后 rejected promise 被永久缓存，
  网络恢复/配置修正后所有 S3 调用仍失败 → `getClient()` 与 `loadS3Sdk()` 均改为失败时清除缓存允许重试
  （`===` 守卫防止并发场景误清后续新建的 promise）。
- **修复 listModels 测试 mock 缺陷**：`vi.mock('@shared/utils')` 部分 mock 缺 `importOriginal`，import 路径调整后
  15 例失败 → 补上真实模块展开。
- 修复删除死代码后暴露的 5 处未用 import（TS6133）；`console.error` 违反仓库 LoggerService 规范改回
  `loggerService.error`；4 处 `import()` 类型标注违反 oxlint consistent-type-imports 规则改类型别名+disable 注释。
- 安全卫生：`tests/apis/*.http` 中硬编码的本地 API token 替换为占位符。

### 测试与验证
- `pnpm typecheck`（node / web / aiCore）零错误。
- 全量测试 **206 文件 / 3582 用例通过**（8 skipped 与基线一致），较上版本净增用例。
- oxlint 6 warnings + 0 errors、eslint 0 errors（warning 均为存量且位于本次未触碰文件）。
- 死代码删除均经全仓 grep 二次验证零引用；lockfile 移除的 78 个包逐一核对均为被删依赖的传递依赖。

## [1.5.6] - 2026-08-21

### 核心主题：桌面挂件四合一（桌面助手）+ 本地音乐收藏按钮

**1. 桌面便签挂件并入音乐挂件，合并为四模块「桌面助手」小窗口**
- **合并方式**：以原音乐挂件窗口为宿主（沿用 `musicWidget.html` 入口、`MusicWidget_*` IPC 通道与
  `music-widget-state.json` 状态文件），便签/待办视图从 `widgets/sticky/` 原样迁入
  `widgets/music/NotesTodosView.tsx`（数据层仍为 Dexie 直读写，零新增 IPC、零新增依赖），
  删除便签挂件窗口及其全部外围代码（WindowService 控制器、`StickyWidget_*` IPC 通道、preload 命名空间、
  `stickyWidget.html` 构建入口、托盘/侧边栏/设置页双入口、开机自启双分支）。
- **四视图切换**：头部 `mode-btn` 单按钮替换为 4 图标切换组（本地音乐 / FM 电台 / 便签 / 待办），
  当前视图高亮；视图选择持久化（`localStorage['musicWidgetView']`，旧值兼容）。
- **关键防丢字设计**：4 视图**始终挂载、CSS 隐藏切换**（`.view-panel.hidden`），而非切换时卸载——
  便签 500ms 防抖草稿、`pagehide`/`visibilitychange` 落库兜底、关闭按钮「先冲刷草稿再关窗」全部保持原语义，
  杜绝「切视图/关窗丢字」回归；代价仅是常驻两个轻量 LiveQuery，可忽略。
- **窗口尺寸按视图自适应**：`WidgetWindowController` 新增 `setSize`（`setContentSize`，窗口本就
  `useContentSize:true`），新增 `MusicWidget_SetSize` IPC 与 preload `musicWidget.setSize`；
  切换视图时应用 per-view 记忆尺寸（默认 local/fm 380×220、notes 320×480、todos 320×440），
  手动拉伸按视图防抖回存（程序化 setSize 用 400ms 时间戳守卫，避免把默认值回写覆盖用户调整）。
- 托盘/侧边栏/设置页入口统一为「桌面助手」；开机自启兼容迁移（`music || sticky`，老用户配置不丢）。

**2. 本地音乐视图新增收藏按钮（歌曲名右侧 ☆/★）**
- **协议扩展**：`WidgetTrack` 增加 `favorite: 0|1`；`WidgetCmd` 增加 `{ a: 'toggleFavorite', id }`。
- **单一写入方**：收藏命令由主窗口侧 `widgetBridge.toggleFavoriteFromWidget` 统一处理——
  写 Dexie `music_tracks` → 收藏夹模式联动（取消当前曲收藏触发 `playerStore.markPendingReturn`，
  播完落回收藏池，与主窗口 `LocalMusicPlayer.onToggleFavorite` 完全同语义）→ 重载曲库 `setTracks`
  同步 `playerStore`（覆盖主窗口未开音乐页、LiveQuery 未挂载的场景）→ 状态广播回推挂件星标校准。
  挂件与主窗口共享同一 IndexedDB，收敛为单一写入方避免两端直接写库竞态；星标不做乐观更新，靠
  update 消息回推，杜绝 UI 与数据源不一致。
- **双向一致性链路**：挂件收藏 ⇄ 主窗口收藏均收敛到 `playerStore` 单一数据源，两端星标实时同步。

**3. 其他清理与优化**
- `electron.vite.config.ts` 移除 stickyWidget 构建入口，`manualChunks` 注释同步更新；
- `IpcChannel.ts` 删除全部 `StickyWidget_*` 通道（Theme 广播只发合并挂件）；
- 设置页「桌面便签挂件」「桌面音乐挂件」两个区块合并为「桌面助手挂件」；两个开机自启配置键
  （`stickyWidgetLaunchOnBoot` / `musicWidgetLaunchOnBoot`）保留读写兼容，UI 切换时同步写入两者。

### 测试与验证
- `pnpm typecheck`（node / web / aiCore）零错误；oxlint / eslint 零错误。
- 渲染层全量测试 **164 文件 / 2817 用例全部通过**；主进程 309 用例、共享层 96 用例全部通过。
- `electron-vite build` 完整构建成功：`musicWidget` 入口 bundle 32.6KB（四模块代码均在），
  无 antd 混入（`manualChunks` reactcore/lucide/vendor-dexie 隔离生效，挂件内存不回归）。

## [1.5.5] - 2026-08-21

### 核心主题：修复主题颜色切换失效 + 安全与隐私全面加固

**1. 修复「部分主题颜色无法切换」的严重 BUG**
- **根因**：`color.css` 中浅色变体选择器 `[theme-id='sky']`（特异性 0,1,0）与深色默认
  `[theme-mode='dark']`（特异性 0,1,0，源码顺序靠后）特异性相同。当 `theme-mode` 属性在切换
  时序中短暂残留为 `dark` 时，深色规则把 sky/pink/butter 全部覆盖成深灰绿 slate —— 表现为
  「粉色/蓝色/黄色无法切换，而绿色/灰色/深蓝正常」的不对称现象（deepblue 因 0,2,0 特异性幸免）。
- **修复（选择器对称化）**：
  - 浅色变体统一加 `[theme-mode='light']` 限定：`[theme-mode='light'][theme-id='sky'|'pink'|'butter']`
  - 深色默认补 `theme-id` 限定：`[theme-mode='dark'][theme-id='slate']`，与 deepblue 对称
  - deepblue 分支补全 11 个自包含变量（`--color-white`、`--color-text`、`--color-hover`、
    `--color-active`、`--glass-border`、`--glass-shadow`、`--chat-*`、`--color-highlight*` 等），
    避免改选择器后从 `:root` 继承浅色值导致深蓝背景下文字不可读
- **修复（JS 层时序加固）**：`ThemeProvider` 新增 `themeRef`（useRef 保存最新 mode/themeId），
  `ThemeUpdated` IPC 回调与主题 token 推送改从 ref 读取最新值，彻底消除闭包捕获过期值导致的属性残留。
- 验证：新增 5 个组件级测试（首次挂载、原子切换、深→浅回切无残留、事件重放用最新值）；Playwright
  真实 CSS 矩阵实验确认 6 主题切换全部正确、残留 dark 时兜底为 oasis 默认绿、deepblue 深色文本可读。

**2. 高危安全漏洞修复：`useBridge` 全量 API 暴露**
- **漏洞**：小程序桥 `useBridge` 原实现允许**任意 `file://` 页面**通过 postMessage 动态调用
  **整个 `window.api`**（含 `file.delete`、`fs.read`、`automation.sysFileWrite` 等敏感能力），
  且未校验 `event.source`。攻击者只需将自定义小程序指向本地恶意 HTML，即可读取/删除/篡改用户任意文件。
- **修复**：
  - 方法**白名单**：仅放行只读方法（getAppInfo/getDiskInfo/getSystemFonts/resolvePath/isPathInside 等）
    与受协议校验的 openWebsite；绝不放行 file 写删、fs、automation、backup、config.set、shell
  - **来源校验**：`event.source` 必须是当前文档内某个 `<webview>` 的 contentWindow，
    杜绝普通 iframe / 独立窗口 / 注入页面伪造调用
  - **结构校验**：type === 'api-call'、method 为字符串、args 为数组，任一不满足即静默忽略
- 验证：新增 9 个测试覆盖全部拒绝路径（敏感方法、非 webview 来源、非 file:// origin、非法结构、退订）。

**3. 中危修复：OAuth 回传缺少 origin 校验**
- **漏洞**：`oauth.ts` 中 4 个 `message` 监听（siliconflow / aihubmix / 302ai / aiionly）
  未校验 `event.origin`，任意网页可注入伪造的 API key。
- **修复**：各自加上官方域名 origin 校验，仅接受对应服务商域名回传。
- 验证：新增 4 个测试覆盖合法/非法 origin 双路径。

**4. 其他优化**
- `ThemeProvider` 主题 token 推送统一从 `themeRef` 读取最新 mode，消除挂件配色极端时序下的旧值推送。

### 测试与验证
- 新增 18 个单测（主题 5 + useBridge 9 + oauth 4）；renderer 全量测试 164 文件 / 2817 用例全部通过。
- `pnpm typecheck`（node / web）与 eslint 零错误。
- 隐私审查确认：无遥测/分析 SDK，日志本地存储无网络上报；已记录待后续评估项：
  主窗口 `webSecurity:false`、CSP `script-src *`、WebDAV/S3 密钥明文存储、IP 地区检测单次外传。

## [1.5.4] - 2026-08-21

### 核心主题：桌面随手便签与音乐播放双独立挂件 + 播放器架构全局化升级

**1. 新增桌面便签待办小挂件（Sticky Widget）**
- **极简独立入口与低内存常驻**：采用定制独立入口（零 Redux/零 Antd 冗余），单进程常驻内存仅 ~50-70MB，关闭即彻底销毁进程释放内存。
- **全功能复现与双向实时同步**：同源直接共享底层 Dexie 数据库，便签创建/修改（500ms 防抖自动保存）及待办事项新增/状态筛选/打勾完成毫秒级双向同步。
- **贴心速记兜底机制**：关闭窗口时自动冲刷未保存草稿，防止快速输入后直接关窗导致内容丢失。
- **桌面常驻控制**：支持一键置顶悬浮在全屏应用之上、一键锁定防止鼠标打字误触拖拽、自由八向拉伸与位置尺寸记忆。

**2. 新增桌面音乐播放小挂件（Music Mini Widget）**
- **纯控制器架构与零音频中断**：挂件作为轻量遥控器运行，100% 复用主窗口底层 `AudioEngine` 单例；关闭/打开挂件绝不打断音乐连贯播放。
- **本地音乐 + FM 电台双模式无缝切换**：
  - 本地模式：显示曲名、歌手、专辑文字信息，支持播放/暂停/切歌/模式切换/音量调节/拖动进度条，内置曲库歌单抽屉。
  - FM 电台模式：实时显示电台流连接状态与码率，展示电台网格快速换台。
- **高能效视觉呈现**：CSS 模拟律动频谱，播放时律动、暂停即静止，完全杜绝 Web Audio 跨进程高频分析带来的无谓 CPU 消耗。

**3. 核心重构：播放器大脑全局化（playerStore）**
- 将原挂载在页面组件 hook 内的播放状态机、曲目队列与 FM 连接逻辑彻底提升为模块级全局单例 `playerStore`。
- **修复主程序切页丢播放控制的历史隐患**：在主程序切换到 AI 聊天、设置或其他页面时，后台播放与全局控制均不丢失。
- 建立主进程中转的双向安全消息桥 `widgetBridge`，实现挂件命令秒级响应与播放进度限频平滑同步（4次/秒 + CSS 过渡）。

**4. 视觉与主题深度融合**
- **晨间绿洲设计语言对齐**：挂件全面适配主程序默认圆角、主色调（#10b981）、灰绿系柔和背景与渐变样式。
- **动态主题 Token 跨窗口广播**：在主程序切换内置 6 套主题时，挂件通过 IPC 实时同步接收 CSS 变量，外观配色与主程序完美统一。

**5. 快捷入口与开机自启体系**
- 侧边栏专属按键：左侧窗口控制栏新增便签与音乐专属图标，点击一键唤醒/关闭挂件。
- 系统设置中心：常规设置新增「桌面便签挂件」与「桌面音乐挂件」控制区块，支持独立开启/关闭及开机自动随软件启动。
- 系统托盘菜单：托盘右键菜单补全便签与音乐挂件唤起入口。

### 测试与验证
- 新增/更新单测：`playerStore` 状态机 12 例覆盖、`useLocalPlayer` 切页恢复用例、音频引擎单测等。
- `pnpm typecheck`（node / web / aicore）与 eslint / oxlint 全部零错误；全量测试 3568 项全部通过。

## [1.5.3] - 2026-08-21

### 核心主题：通知系统自定义提示音 + 全面 BUG 修复

**1. 通知系统升级：每个来源独立开关 + 自定义提示音（新增）**
- 设置 → 常规设置 → 通知：每个通知来源（通用对话助手 / 备份 / 自动化任务助手 / 灵感生图助手）新增「选择声音」按钮，位于开关左侧。
- 支持选择本地音频文件（MP3/WAV/OGG/M4A/FLAC/AAC，≤20MB），选择后立即试听；可一键清除恢复默认提示音。
- 未配置本地文件时使用软件内置柔和「叮」提示音（Web Audio 合成，无文件依赖，主窗口/后台都能播）。
- 新增「灵感生图助手」通知来源开关：生图完成且应用在后台时，弹出系统通知并播放对应提示音。
- 通知设置数据结构升级为「开关 + 声音」独立配置，老版本布尔数据自动迁移兼容，无需手动操作。

**2. 修复生图助手打不开的严重崩溃**
- 空会话的生图助手点击后崩溃：话题列表为空时 `activeTopic` 为 `undefined`，多处读取 `.id` 抛
  `Cannot read properties of undefined (reading 'id')`。已对所有 `activeTopic` 访问加判空保护
  （Topics / HomePage / TopicManageMode / useTopic）。

**3. 修复自动化任务偶发丢失**
- 主窗口不可用（应用退出中等）时，任务调度状态仍被消耗：一次性任务被永久关闭、周期任务触发点错位。
  改为先确认窗口可用再变更调度状态；窗口不可用时本次跳过，窗口内下次触发自动补上。

**4. 修复生图历史删除后列表不刷新**
- 删除生成记录后历史列表不更新：改用 Redux 实时读取最新助手数据驱动列表刷新（useLiveQuery 依赖更新）。

**5. 修复通知「双重发声」**
- 系统通知原本由操作系统再播一次默认提示音，与自定义提示音叠加成双重声音。
  已让系统通知静默（silent），声音统一由渲染进程按配置播放。

**6. 修复声音资源泄漏**
- 通知频繁触发时振荡器/增益节点堆积；选择声音文件时每次创建 AudioContext 不释放。
  均改为播放完毕后自动断开节点 / 关闭 context。

**7. 修复类型错误**
- 修复 `OscillatorNode.stopTime` 非标准类型导致 typecheck 报错的问题。

**8. 其他优化**
- 效率助手四宫格布局调整：左上 闹钟 / 右上 便签 / 左下 日历 / 右下 音乐（对调了左右功能块）。
- Windows 开发启动脚本重构：`start-dev.bat` 瘦身并迁移到 `node scripts/start-dev.js`，新增 `start.cmd`，启动逻辑统一。

### 测试与验证
- 新增/更新单测：通知服务拦截、声音选择工具、通知数据迁移、activeTopic 崩溃修复、自动化调度（AutomationService 28 例）。
- `pnpm typecheck`（node / web / aicore）与 lint 全部通过；相关模块 497 项测试全绿。

## [1.5.2] - 2026-08-20

### 核心主题：UI 细节优化与核心交互/便签 BUG 修复

本次版本针对桌面交互细节、图片生成历史管理、设置项展示以及便签模块的严重初始化 BUG 进行了集中排查与彻底修复。

**1. 修复左侧导航栏拉动小程序固定图标往右时多出边框的问题**
- 修复无边框毛玻璃布局下 `SidebarGlass` 样式在左侧导航栏模式下误挂载 `border-left` 的问题，仅在右侧导航栏模式下保留内侧分割线，彻底消除图标向右拖拽时左侧导航栏暴露多余边框的异常。

**2. 修复图片生成历史列表删除按键无反应的问题**
- 将历史记录项中的 `DeleteBtn` 从普通 `div` 重构为标准 `<button>`，补充 `pointer-events: auto` 与独立 `z-index`，并优化悬浮透明度与交互层级，确保点击删除时可靠触发删除并正确阻止冒泡。

**3. 设置-常规设置【关注】更名为【关于】并支持直达发布地址**
- 常规设置中底部信息分组名称由「关注」修正为「关于」。
- 点击「发布地址」由原先仅复制 URL 到剪贴板，优化为自动调用系统默认浏览器弹出 GitHub 发布地址网页（`https://github.com/HaiSeaman/cherry-studio-BB`）。

**4. 修复打开软件或切换 TAB 页自动新增空白便签的严重 BUG**
- 移除 `NotesPanel` 在空状态时自动插入空白便签的副作用逻辑，彻底解决每次软件冷启动或在「效率助手」与其他 TAB 页之间切换时误创建大量空白便签的问题。

### 测试与验证
- 全量单元测试：200 个测试套件，3542 个测试用例全部通过（`npm run test`）。
- 类型与代码检查：`pnpm typecheck`（node / web / aicore）与 `npm run lint` 全部通过。

## [1.5.1] - 2026-08-20

### 核心主题：AI 自动化任务改版 + 常规设置新增「关注」

本次把**自动化任务的执行配置从「绑定助手」改为「任务自包含」**：任务不再依赖某个助手，直接在任务里选模型、写提示词、勾 MCP，也更灵活可控。

**自动化任务编辑：执行助手 → AI 模型**
- 原「执行助手」下拉改为直接选择**软件里已配置的 AI 模型**（按服务商分组），不再需要先建助手再选。
- 新增**自定义提示词**输入框（选填）：为任务设定角色或思考方式，运行时作为系统提示词；留空使用默认。
- 原任务绑定的助手被删、或模型未设置，过去会导致任务跑不了；现在模型被删/服务商被删时运行会给出明确报错提示（引导重新选择），不再静默失败。

**自动化任务编辑：MCP 开关 + 任务级选择**
- 保留「启用 MCP 工具」开关，开启后会出现多选框，让你**明确勾选任务要使用的 MCP 服务器**（默认空选）。
- 勾选的服务器后来被停用/删除时，运行会自动跳过该服务器并在时间线记一条黄色「提示」，不再无声中断。

**自动化任务编辑：每周多选星期**
- 「每周定时」的星期从单选改成**多选**：可以一次设置周一、周三、周五等多个运行日（例如「每周一/三/五 08:00」），不用再为每个运行日各建一个任务。

**旧任务自动兼容（无需任何操作）**
- 老任务的每周单选星期自动转成多选；老任务（未选模型）运行时自动沿用原绑定助手的模型/提示词/MCP 配置。编辑保存一次后即转为新格式。

**常规设置新增「关注」**
- 常规设置 → 开发者模式下方新增「关注」分组：显示软件名 `cherry-studio-BB` 和当前版本号。
- 右侧「**发布地址**」按钮：一键复制 `https://github.com/HaiSeaman/cherry-studio-BB` 到剪贴板。

### 测试与验证
- 调度器与旧数据迁移新增/更新测试，`AutomationService` 单测 21 → 28 例全绿；`pnpm typecheck`（node/web/aicore）、eslint、oxlint 全部通过。

### 验证方式
```powershell
npx vitest run src/main/services/__tests__/AutomationService.test.ts
```

## [1.4.0] - 2026-08-19

### 核心主题：常驻内存大幅下降（资源优化重构）

本次版本聚焦**降低应用常驻内存与后台资源占用**，不动界面、不动操作习惯，纯性能优化。实测内存峰值从 **约 1.35GB → 约 0.8GB**（约 -40%，场景不同浮动），后台挂机 CPU 占用同步下降。

**为什么能省这么多**：旧版启动后会在后台常驻 4 个隐藏渲染进程（迷你窗口预加载 + 划词助手工具栏 + 划词动作窗口 + 系统保留渲染器），合计约 580MB，用户什么都没干也在烧内存。本次将大部分改为「首次用到时再创建」。

**删除预加载窗口（省 ~500MB）**
- 快捷助手迷你窗口：不再随启动预创建，改为首次唤出时创建（首唤约慢 0.5 秒，之后复用无感）。该预加载原本仅用于规避 macOS 窗口问题，Windows 上纯属浪费。
- 划词助手工具栏 + 动作窗口：同样改为首次划词时创建（首次慢 ~0.5 秒，之后复用）；启动即预建的两个渲染进程（约 320MB）消失。

**主进程瘦身（省 ~50-80MB）**
- 删除 93 行死代码：主进程的 `@napi-rs/canvas` DOMMatrix polyfill 实际无人使用（主进程从未加载 pdf-parse），连同依赖与打包配置一并移除。
- `officeparser`（Office 文档解析）、`jsdom`（网页文本提取）改为按需动态加载，不再随主进程启动常驻。
- 删除本地崩溃收集器 `crashReporter`（`uploadToServer: false`、无人查看），其常驻 crashpad 进程（约 39MB）不再拉起。

**后台节流恢复**
- 移除 `backgroundThrottling: false`（1.0 模板遗留）：窗口最小化 / 隐藏到托盘后，Chromium 恢复对隐藏页的定时器节流，后台 CPU 占用明显下降。闹钟有 90 秒补触发窗口兜底、正在播放音频的页面不受节流影响，功能不受损。

**小程序闲置回收**
- 新增：后台小程序闲置 30 分钟后自动销毁其 webview 进程（约 300MB/个），重开时自动恢复到关闭前页面。
- 正在播放音频/视频的小程序（如后台听歌）**永不回收**，不会打断播放。

**其他**
- 全量验证：`typecheck` 通过、3506 项测试全绿、构建产物确认动态依赖正确分包。
- 安装包进一步瘦身（移除 @napi-rs/canvas 原生模块）。

### 验证方式
```powershell
# 对比优化前后进程数与总内存
Get-CimInstance Win32_Process -Filter "Name='Cherry-Studio-BB.exe'" |
  Measure-Object WorkingSetSize -Sum |
  ForEach-Object { [math]::Round($_.Sum/1MB) }
```
优化后进程数由 9 个降至约 5 个。

## [1.3.2] - 2026-08-18

### 新增：截图「识别文字 / 翻译图片」

- 截图框选工具栏新增「识别文字」「翻译图片」两个按键：点击后自动将截图发送到快捷助手并交给多模态模型处理，无需再次确认。
- 快捷助手输入框新增同名快捷按钮：截图后或从外部复制图片粘贴进输入框时，点击即自动识别 / 翻译。
- 识别 / 翻译复用软件已配置的多模态 AI 模型（发图给模型），不引入额外 OCR 引擎。
- 技术实现：pnpm `patchedDependencies` 固化 `react-screenshots` / `electron-screenshots` 两个补丁，扩展截图工具栏与 `ocr` / `translate` 事件通道。

**修复 / 加固**
- 打包配置：`node-screenshots` 原生模块加入 asarUnpack（修复打包后截图功能不可用的问题）。
- 截图空 buffer 防御、快捷助手加载中防重复自动发送、无视觉模型时明确提示。

**其他**
- 修复全量 lint 中 14 个 import 排序 / `prefer-const` 错误。

## [1.3.1] - 2026-08-17

### 精简代码（重构 / 死代码清理，无功能变更）

本版本为纯"精简代码"优化：不新增功能、不改变界面与操作，全部为等价重构与不可达代码删除，低风险、无回归、用户数据零丢失。

**删除**
- 移除约 2900 行历史 Redux-persist 迁移函数（216 个，已不再运行），持久化版本压回基线 0。
- 删除约 500 行不再被引用的 `test_utils` 死代码群。
- 删除约 238 行不可达的 GitBash 死链路。

**重构 / 收敛**
- 将本地 / WebDAV / S3 三个备份管理器（约 620 行重复）合并为单一通用 `BackupManager` + thin wrapper。
- 收敛便签页重复代码：铃声展示名 `soundLabel` 去重、两套便签面板 9 个重复 styled 组件抽到设计系统层、本地音乐 / 便签两页设计系统单一化。
- 备份同步状态展示收敛为一个共享 `SyncStatus` 组件。
- 输入端工具条 12 处重复的 `<Tooltip>` 按钮外壳收敛为一个 `ToolActionIconButton`。

**带来的好处**
- 累计净删约 4500 行代码，包体积更小、加载更轻、启动更快。
- 单一事实来源：同类型 UI 与逻辑只维护一处，改一处全局生效。
- 三个备份来源、各工具按钮行为与可访问性更统一、更易维护。

**验证**
- `typecheck` 通过；相关单测全部通过；用户持久化数据零丢失。