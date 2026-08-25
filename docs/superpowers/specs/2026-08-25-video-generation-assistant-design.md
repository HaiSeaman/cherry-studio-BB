# 视频生成助手（video_gen）设计文档

- 日期：2026-08-25
- 状态：已与用户逐节确认，待用户最终审阅
- 目标：新增独立的「视频创作助手」，接入阿里云百炼、火山豆包（Ark/Seedance）、腾讯混元三家的视频生成 API，支持文生视频与图生视频（首帧参考图）

## 1. 背景与决策

### 1.1 需求
用户希望在软件中加入视频生成能力：
- 入口形态：**独立视频生成助手**（方案 B），与现有「灵感生图助手」并列，而非塞进图片生成模块。
- 服务商：阿里云百炼、火山豆包、腾讯混元三家；用户在「设置 → 模型服务」里添加各家模型后，在视频助手里选模型即可生成，体验与生图一致。
- 能力：第一版同时支持文生视频和图生视频（首帧参考图）。

### 1.2 已否决的方案
- **方案 A（扩展 PaintWorkspace）**：绘画输入框参数已经很多，再叠加时长/分辨率会混乱；"同步等结果"与"轮询等任务"两套状态逻辑耦合，维护成本高。
- **方案 C（通用异步任务框架）**：当前只有视频需要完整轮询，抽象为过度设计（YAGNI）。适配器层保留统一接口形状，未来有第二个场景再抽象。

## 2. 现状分析（代码事实）

| 事实 | 位置 | 对本设计的意义 |
|---|---|---|
| 助手类型驱动工作区切换：`'chat' \| 'image_gen' \| 'automation'` | `src/renderer/src/types/index.ts`（`AssistantType`、`getAssistantType`）；`pages/home/HomePage.tsx` | 新增 `'video_gen'` 类型 + HomePage 分支即可挂载新工作区 |
| 新建助手的模板卡片列表 | `pages/home/Tabs/index.tsx` | 加第四张「🎬 视频创作助手」模板卡 |
| 生图完整链路可仿照 | `pages/paint/*`（paintService / fetchPaintGeneration / PaintContent / PaintHistoryList / PaintInputbar） | 会话持久化、自动保存、通知、中止控制的成熟模板 |
| DashScope 原生协议适配先例（含异步任务轮询） | `aiCore/utils/dashscopeImage.ts` | 视频适配器直接沿用其模式与工具函数（`isDashScopeProvider`、`getNativeBaseUrl`） |
| 远程 URL 过期需本地持久化 | paintService 的 `persistRemoteImages`（百炼 OSS 链接仅 24h 有效） | 视频 URL 同样短期有效，必须下载到内部存储 |
| 消息系统已支持视频块 | `types/newMessage.ts`（`MessageBlockType.VIDEO`）、`utils/messageUtils/create.ts`（`createVideoBlock`）、`pages/home/Messages/Blocks/VideoBlock.tsx` → `MessageVideo` 播放器 | 视频结果的存储与渲染地基现成 |
| 渲染进程可直接 fetch 外部 API | dashscopeImage.ts 内直接 `fetch` 提交与轮询 | 视频轮询同样在渲染进程实现 |
| Provider 只有一个 `apiKey` 字段 | `types/provider.ts` | 腾讯 TC3 双密钥需约定格式存放（见 §5.3） |

## 3. 三家 API 概况

> ⚠️ 下表为设计依据；具体 Action 名、参数名以各家官方文档为准，实施第 3 步第一步先用真实 Key 做连通性验证。

| 厂商 | 模式 | 鉴权 | 要点 |
|---|---|---|---|
| 阿里云百炼 | 异步任务：提交 → `task_id` → 轮询 `/api/v1/tasks/{task_id}` | Bearer API Key | 提交带 `X-DashScope-Async: enable`；尺寸用 `*` 分隔（如 `1280*720`）；图生视频传 `img_url`（支持 base64 data URL）；支持取消任务接口。模型：wan*-t2v / wan*-i2v 系列 |
| 火山豆包 Ark | 异步任务：`POST {host}/api/v3/contents/generations/tasks` → 轮询同路径 `/{task_id}` | Bearer API Key | 参数以文本指令内嵌在 content 的 text 中（`--duration 5 --resolution 720p --ratio 16:9 --watermark false` 等）；图生视频在 content 数组加 `image_url` 项（支持 base64）；模型：doubao-seedance 系列；默认 host `https://ark.cn-beijing.volces.com/api/v3` |
| 腾讯混元 | 异步任务：Submit → Query（腾讯云 API） | **TC3-HMAC-SHA256 签名**（SecretId + SecretKey） | 域名 `hunyuan.tencentcloudapi.com`；图生用 ImageBase64/ImageUrl；无远端取消接口则第一版仅本地停止轮询 |

共同约束：
- 全部不返回百分比进度 → UI 显示状态 + 已用时，不做假进度条。
- 返回的视频 URL 有效期短（约 24 小时）→ 成功后立即下载持久化。

## 4. 架构

```
首页新建助手 → 「🎬 视频创作助手」(type: video_gen)
        ↓ HomePage 分支
VideoWorkspace（左 VideoHistoryList | 右 VideoContent + VideoInputbar）
        ↓
videoService（会话/消息落库、任务状态更新、下载持久化、自动保存、通知、停止控制）
        ↓
fetchVideoGeneration（统一入口：按模型所属服务商分发；未适配服务商提前拦截）
   ├─ aiCore/utils/dashscopeVideo.ts      （百炼）
   ├─ aiCore/utils/arkVideo.ts            （火山 Ark）
   └─ aiCore/utils/tencentHunyuanVideo.ts （腾讯混元，依赖 tc3Signature.ts）
```

### 4.1 统一适配器接口

```ts
type VideoTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed'

type VideoGenerationParams = {
  provider: Provider
  model: Model
  prompt: string
  inputImage?: string          // base64 data URL（图生视频首帧）
  duration?: string            // '5' | '10'
  resolution?: string          // '480p' | '720p' | '1080p'
  aspectRatio?: string         // 如 '16:9'
  signal?: AbortSignal         // 停止轮询
}

// 提交并轮询直到终态；进度通过回调上抛
submitAndWaitVideoTask(params, onStatus): Promise<{ videoUrl: string }>
```

各适配器内部完成：参数名转换（如尺寸分隔符）、base64 传递方式差异、状态枚举归一化、错误信息提取（余额不足/内容违规等原样透出）。

### 4.2 任务生命周期

1. 用户点生成 → 建会话（无则新建）→ 写用户提示词消息 + 助手 PENDING 视频消息。
2. 首次生成用提示词前 20 字命名会话（复用 paint 的 Unicode 码点切分做法）。
3. 提交任务 → 每 3 秒轮询 → 回调更新消息占位文案：「排队中 → 生成中（已用时 X 秒）」。
4. succeeded → 下载视频到应用内部存储（FileManager）→ 更新 VIDEO 块为 SUCCESS（url 用本地 URL，metadata 记原始远程 URL）→ 自动保存到用户设置的保存路径 → 应用失焦时发系统通知。
5. failed / 超时（10 分钟上限）/ 未适配服务商 → 块落 ERROR，错误信息透出。
6. 用户点「停止生成」→ AbortSignal 停止轮询，块落 PAUSED；尽力调用远端取消（百炼取消接口 / Ark 删除任务；腾讯仅本地停止）。
7. 单任务并发（同一时刻一条任务），与 paint 的 activeAbortController 模式一致。

### 4.3 数据与状态管理

- 完全复用 Topic / Message / MessageBlock 体系与会话历史机制；结果块用 `createVideoBlock`。
- 不新增 Redux slice：消息状态走数据库直更（与 paint 相同模式）。
- 存储体积提示：720p/5s 视频约数 MB，自动保存跟随现有「保存路径」设置，行为与图片一致。

## 5. 关键设计决策

### 5.1 服务商预设与模型识别
- `config/providers.ts`：内置两个新预设——火山引擎 Ark（apiHost `https://ark.cn-beijing.volces.com/api/v3/`）、腾讯混元（apiHost `https://hunyuan.tencentcloudapi.com/`），描述中写清 apiKey 填写格式。
- `config/models/default.ts`：dashscope 默认模型表补 wan*-t2v/-i2v 视频模型。
- 新建 `config/models/video.ts`：`DEDICATED_VIDEO_MODELS` 正则表 + `isVideoModel()`；视频助手模型下拉框用它过滤。正则覆盖：`wan\d[\w.]*-(t2v|i2v)`、`doubao-seedance`、`hunyuan-video` 等。
- 边界：用户选了识别为视频模型但服务商未适配 → `fetchVideoGeneration` 提交前拦截，提示「该服务商暂不支持视频生成」。识别为视频模型但路由不到适配器绝不能进入请求阶段。

### 5.2 图生视频传图
- 本地参考图转 base64 data URL 传入（三家均声明支持 base64 形态；若实测某家不支持，单独为该家实现临时上传方案，作为已知风险项跟踪）。
- 参考图分辨率需满足所选分辨率档位要求，UI 在选择冲突时给出提示文案。

### 5.3 腾讯双密钥存放
- Provider 仅有一个 `apiKey` 字段。约定：腾讯混元的 apiKey 填 `SecretId:SecretKey`（半角冒号分隔）。
- `tc3Signature.ts` 解析并校验格式；格式错误抛出可操作的中文提示。
- 设置页该预设的描述文字写明填写格式。

### 5.4 错误处理
- 轮询 3 秒间隔；10 分钟超时上限；网络抖动允许连续重试若干次后才判失败。
- 服务端业务错误（欠费、内容审核不通过等）信息原样展示在错误卡。
- 所有错误块落库（SerializedError），会话删除后的块更新失败静默忽略（与 paint 一致）。

## 6. 实施步骤

### 第 1 步：类型与入口
- `types/index.ts`：`AssistantType` 加 `'video_gen'`；`getAssistantType` 兼容返回。
- `pages/home/Tabs/index.tsx`：加第四张模板卡片「🎬 视频创作助手」。
- `pages/home/HomePage.tsx`：`video_gen` 分支懒加载渲染 `VideoWorkspace`。
- 验证：能创建视频助手并切换到空工作区；老数据（无 type）不受影响。

### 第 2 步：模型识别与服务商预设
- 新建 `config/models/video.ts`（`isVideoModel` + 正则表）+ 单测。
- `config/providers.ts`：内置 ark、hunyuan 预设。
- `config/models/default.ts`：补 dashscope 视频默认模型。
- 验证：单测通过；设置页可见并可启用新服务商。

### 第 3 步：三家适配器（核心，放 `aiCore/utils/`）
- `dashscopeVideo.ts`（复用 dashscopeImage 的 host 识别/轮询模式）。
- `arkVideo.ts`。
- `tencentHunyuanVideo.ts` + `tc3Signature.ts`（签名独立模块，固定输入向量的专项单测）。
- 统一类型定义与状态归一化；每家配 mock fetch 单测。
- 验证：单测全绿；真实 Key 手工连通一家再进入下一家。

### 第 4 步：服务层
- 新建 `pages/video/services/fetchVideoGeneration.ts`（分发 + 拦截）。
- 新建 `pages/video/services/videoService.ts`（会话/消息、轮询循环、持久化下载、自动保存、通知、停止控制）。
- 验证：服务层单测（仿照 `pages/paint/store/__tests__` 的组织方式）。

### 第 5 步：UI 四件套
- `VideoWorkspace.tsx`、`VideoContent.tsx`、`VideoHistoryList.tsx`、`VideoInputbar.tsx`。
- 输入栏：模型选择（isVideoModel 过滤）、提示词 + 一键优化（复用 paint 的 enhancePrompt 模式）、首帧参考图上传、时长/分辨率/宽高比胶囊、生成/停止按钮。
- 消息流：状态占位卡 → VIDEO 块播放器 / 错误卡。
- 验证：手工全流程——文生视频、图生视频、中途停止、断网报错、后台完成通知。

### 第 6 步：收尾
- 全量测试与 lint 通过；真实三家账号各出一条视频验收；清理临时调试代码；确认最终 diff 只含预期改动。

## 7. 测试策略

- 适配器：mock fetch 单测（成功/失败/超时/取消/参数转换），腾讯签名专项测试。
- 服务层：会话创建、状态流转、URL 持久化降级（下载失败保留原 URL）。
- 模型识别：正则命中/不命中样例表。
- 手工验收清单：见第 6 步。

## 8. 风险与待验证项

| 风险 | 缓解 |
|---|---|
| 三家 API 参数细节与文档记忆有出入（尤其腾讯 Action 名） | 实施第 3 步先做真实连通性验证，以官方文档为准核对 |
| base64 传图某家实际不支持 | 风险项跟踪；必要时为该家单独做临时上传 |
| 腾讯无远端取消（或未确认） | 第一版本地停止轮询，UI 注明"已停止本地等待" |
| 视频 URL 过期导致历史记录失效 | 成功即下载持久化；下载失败保留原 URL 并记日志（与图片同策略） |
| 大文件占用磁盘 | 行为与图片自动保存一致，由用户保存路径设置管控 |
