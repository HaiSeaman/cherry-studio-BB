# 动感视频助手实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增独立「🎬 动感视频助手」（`video_gen`），接入阿里云百炼、火山豆包 Ark、腾讯混元的视频生成 API，支持文生视频与图生视频。

**Architecture:** 新增 `video_gen` 助手类型驱动 `VideoWorkspace`；服务层统一"提交任务→轮询→取 URL"三步流程，三家各一个适配器放 `aiCore/utils/`（与 `dashscopeImage.ts` 同层同模式）；会话/消息复用 Topic/Message/VIDEO 块体系。

**Tech Stack:** Electron + React + TypeScript + styled-components、vitest、Dexie(db) / Redux(仅话题元数据)。

**Spec:** `docs/superpowers/specs/2026-08-25-video-generation-assistant-design.md`

## Global Constraints

- 助手名「动感视频」、模板标题「动感视频助手」、emoji 🎬。
- 轮询间隔 3s，超时上限 10 分钟；进度只显示状态+已用时，不做假进度条。
- 视频 URL 成功后立即下载持久化（24h 过期）；下载失败保留原 URL 并 log warn。
- 停止生成 = 本地停止轮询 + 尽力远端取消（百炼 cancel 接口 / Ark DELETE；腾讯仅本地）。
- 未适配服务商的视频模型必须在请求前拦截报错。
- 腾讯 apiKey 约定格式 `SecretId:SecretKey`（半角冒号），解析失败给可操作中文提示。
- 所有新逻辑注释用中文；遵循仓库现有 oxlint/eslint 规则；测试命令 `npm run test -- <path>`（vitest）。
- 不新增 npm 依赖。

---

### Task 1: 类型与入口

**Files:**
- Modify: `src/renderer/src/types/index.ts`（AssistantType 定义处）
- Modify: `src/renderer/src/pages/home/Tabs/index.tsx`（ASSISTANT_TEMPLATES）
- Modify: `src/renderer/src/pages/home/HomePage.tsx`

**Interfaces:**
- Produces: `AssistantType = 'chat' | 'image_gen' | 'automation' | 'video_gen'`；`getAssistantType` 对 `'video_gen'` 返回 `'video_gen'`。

- [ ] **Step 1:** `types/index.ts` 中 `AssistantType` 加 `'video_gen'`，`getAssistantType` 的白名单判断加 `t === 'video_gen'`
- [ ] **Step 2:** `Tabs/index.tsx` ASSISTANT_TEMPLATES 加第四项 `{ type: 'video_gen', emoji: '🎬', title: '动感视频助手', name: '动感视频', desc: '文字/图片生成视频：时长、分辨率、首帧参考图' }`
- [ ] **Step 3:** `HomePage.tsx` 增加 `getAssistantType(activeAssistant) === 'video_gen'` 分支，懒加载 `<VideoWorkspace>`（本任务先用临时空组件占位？否——直接先建最小 VideoWorkspace 骨架文件，见 Task 9 完整版）

```tsx
const VideoWorkspace = lazy(() => import('./VideoWorkspace'))
// 分支顺序：image_gen → video_gen → automation → Chat
```

**注意：** 为保证每步可编译，Task 1 同时创建 `pages/home/VideoWorkspace.tsx` 最小骨架（Container/Main 布局 + 占位文案），Task 9 替换为完整实现。

- [ ] **Step 4:** `npm run typecheck:web` 通过；手工验证能创建「动感视频」助手并切到工作区
- [ ] **Step 5:** Commit `feat(video): 新增 video_gen 助手类型与工作区入口`

### Task 2: 模型识别 isVideoModel

**Files:**
- Create: `src/renderer/src/config/models/video.ts`
- Test: `src/renderer/src/config/models/__tests__/video.test.ts`

**Interfaces:**
- Produces: `isVideoModel(model: Model | undefined): boolean`；导出 `DEDICATED_VIDEO_MODEL_REGEX`。

- [ ] **Step 1:** 写失败测试（命中：`wan2.2-t2v-plus`、`wan2.6-i2v-flash`、`doubao-seedance-1-0-lite-t2v-250428`、`hunyuan-video-standard`；不命中：`wan2.5-t2i`、`qwen-image`、`gpt-4o`、`seedream-4.0`）
- [ ] **Step 2:** 实现：

```ts
const DEDICATED_VIDEO_MODELS = [
  // 阿里百炼通义万相
  String.raw`wan\d[\w.]*-(?:t2v|i2v)(?:-[\w-]+)?`,
  String.raw`wanx(?:-[\w-]+)*-(?:t2v|i2v)`,
  // 火山豆包 Seedance
  String.raw`(?:doubao-)?seedance(?:-[\w-]+)?`,
  // 腾讯混元
  String.raw`hunyuan-video(?:-[\w-]+)?`
]
export const DEDICATED_VIDEO_MODEL_REGEX = new RegExp(DEDICATED_VIDEO_MODELS.join('|'), 'i')
export function isVideoModel(model?: Model): boolean {
  if (!model) return false
  return DEDICATED_VIDEO_MODEL_REGEX.test(model.id)
}
```

- [ ] **Step 3:** 测试通过后 Commit `feat(video): 视频模型识别规则`

### Task 3: 服务商预设与默认模型

**Files:**
- Modify: `src/renderer/src/config/providers.ts`
- Modify: `src/renderer/src/config/models/default.ts`（SYSTEM_MODELS.dashscope）

**Interfaces:**
- Produces: SystemProviderId 含 `'ark'`、`'hunyuan'`（跟随现有 z.enum 清单与 SYSTEM_PROVIDERS_CONFIG 结构）；dashscope 默认模型含 wan t2v/i2v 代表型号。

- [ ] **Step 1:** providers.ts：SystemProviderIdSchema/SystemProviderConfigIds/SYSTEM_PROVIDERS_CONFIG/INITIAL_STATE_EXCLUDED_PROVIDER_IDS 相关清单加 ark、hunyuan 两项：

```ts
ark: {
  id: 'ark',
  name: '火山引擎Ark', type: 'openai',
  apiKey: '', apiHost: 'https://ark.cn-beijing.volces.com/api/v3/',
  models: SYSTEM_MODELS.ark!, isSystem: true, enabled: false
},
hunyuan: {
  id: 'hunyuan', name: '腾讯混元', type: 'openai',
  apiKey: '', apiHost: 'https://hunyuan.tencentcloudapi.com/',
  models: SYSTEM_MODELS.hunyuan!, isSystem: true, enabled: false,
  notes: 'apiKey 请填 SecretId:SecretKey（半角冒号分隔），用于 TC3 签名'
}
```

（enabled 初值、是否进 INITIAL_STATE_EXCLUDED_PROVIDER_IDS 以现有 dashscope 写法为准，保持一致。）
- [ ] **Step 2:** default.ts 给 SYSTEM_MODELS 加 `ark`（doubao-seedance-1-0-lite-t2v / i2v 等）、`hunyuan`（hunyuan-video-standard 等）、dashscope 补 `wan2.x-t2v-plus`、`wan2.x-i2v-flash` 等条目（group 用 'Video'）
- [ ] **Step 3:** typecheck 通过；设置页可见两家新服务商且描述正确
- [ ] **Step 4:** Commit `feat(video): 内置火山Ark/腾讯混元服务商预设与视频默认模型`

### Task 4: 百炼适配器 dashscopeVideo.ts

**Files:**
- Create: `src/renderer/src/aiCore/utils/dashscopeVideo.ts`
- Test: `src/renderer/src/aiCore/utils/__tests__/dashscopeVideo.test.ts`

**Interfaces:**
- Consumes: `isDashScopeProvider`、`getNativeBaseUrl`、`abortableDelay`（从 dashscopeImage.ts 导出复用——若未导出则在本任务将其 export）。
- Produces: 与 Task 6 相同的统一接口（见下），后续 fetchVideoGeneration 依赖：

```ts
// 三家适配器共同签名（定义于 aiCore/utils/videoGenerationTypes.ts，Task 4 创建）
export type VideoGenParams = {
  provider: Provider
  model: string            // 模型 ID 字符串
  prompt: string
  inputImage?: string      // base64 data URL（图生视频首帧）
  duration?: string        // '5' | '10'
  resolution?: string      // '480p' | '720p' | '1080p'
  aspectRatio?: string     // '16:9' 等
  signal?: AbortSignal
}
export type VideoStatusCallback = (status: { state: 'queued' | 'running'; elapsedMs: number }) => void
export async function generateDashScopeVideo(params: VideoGenParams, onStatus?: VideoStatusCallback): Promise<string>
// 返回 videoUrl；失败/超时 throw Error（中文可读信息）
```

- [ ] **Step 1:** 创建 `aiCore/utils/videoGenerationTypes.ts` 放上述公共类型
- [ ] **Step 2:** 失败测试：mock 全局 fetch——①提交成功返回 task_id；②轮询一次 PENDING 再 SUCCEEDED 返回 `output.video_url`；③FAILED 时错误信息含 code/message；④超时路径（将超时常量注入或 fake timer）
- [ ] **Step 3:** 实现：提交 `POST {base}/api/v1/services/aigc/video-generation/video-synthesis`，headers 带 `X-DashScope-Async: enable`；body：

```ts
{
  model,
  input: {
    prompt,
    ...(inputImage ? { img_url: inputImage } : {}),
    ...(negativePrompt ? {} : {})   // 第一版不做负向提示词
  },
  parameters: {
    ...(size ? { size } : {}),        // aspectRatio 映射为百炼 size '1280*720' 等，见映射表
    ...(duration ? { duration: Number(duration) } : {})
  }
}
```

宽高比→尺寸映射（16:9→`1280*720`(1080p 时 `1920*1080`)、9:16→`720*1280`(1080p `1080*1920`)、1:1→`960*960`(1080p `1440*1440`)、缺省不传 size 由服务端默认）。轮询 `GET {base}/api/v1/tasks/{task_id}`，间隔 3s 上限 10min；状态映射 PENDING→queued、RUNNING→running、SUCCEEDED→取 `output.video_url`（无 url 则报错）、FAILED/CANCELED/UNKNOWN→throw。停止轮询时尽力 `POST {base}/api/v1/tasks/{task_id}/cancel`（fire-and-forget，catch 忽略）。
- [ ] **Step 4:** 测试通过；Commit `feat(video): 百炼 DashScope 视频生成适配器`

### Task 5: 火山 Ark 适配器 arkVideo.ts

**Files:**
- Create: `src/renderer/src/aiCore/utils/arkVideo.ts`
- Test: `src/renderer/src/aiCore/utils/__tests__/arkVideo.test.ts`

**Interfaces:** 同 Task 4 公共类型；`generateArkVideo(params, onStatus?): Promise<string>`

- [ ] **Step 1:** 失败测试：①content 数组组装正确（text 含内嵌参数指令、image_url 项在图生视频时存在）；②queued→running→succeeded 轮询返回 `content.video_url`；③failed 透出 message
- [ ] **Step 2:** 实现：`POST {host}/api/v3/contents/generations/tasks`（host 取 provider.apiHost 去尾部斜杠；若 apiHost 不含 `/api/v3` 则自动补）：

```ts
{
  model,
  content: [
    { type: 'text', text: buildInstructionText(prompt, duration, resolution, ratio) },
    ...(inputImage ? [{ type: 'image_url', image_url: { url: inputImage } }] : [])
  ]
}
// buildInstructionText: `${prompt} --resolution ${resolution ?? '720p'} --duration ${duration ?? '5'}${ratio ? ` --ratio ${ratio}` : ''} --watermark false`
```

轮询 `GET {host}/api/v3/contents/generations/tasks/{id}`；status 映射 queued→queued、running→running、succeeded→`content.video_url`、failed/cancelled/expired→throw。停止=DELETE 任务（fire-and-forget）。
- [ ] **Step 3:** 测试通过；Commit `feat(video): 火山 Ark(Seedance) 视频生成适配器`

### Task 6: 腾讯 TC3 签名与混元适配器

**Files:**
- Create: `src/renderer/src/aiCore/utils/tc3Signature.ts`
- Create: `src/renderer/src/aiCore/utils/tencentHunyuanVideo.ts`
- Test: `src/renderer/src/aiCore/utils/__tests__/tc3Signature.test.ts`、`__tests__/tencentHunyuanVideo.test.ts`

**Interfaces:** 同公共类型；`generateHunyuanVideo(params, onStatus?): Promise<string>`；tc3Signature 导出 `signTc3(secretId, secretKey, payload): { headers: Record<string,string>, url: string }`（纯函数便于测试）。

- [ ] **Step 1:** tc3Signature：用 WebCrypto（`crypto.subtle.importKey('HMAC')`）实现 TC3-HMAC-SHA256：canonical request → string-to-sign → 派生签名。固定输入向量测试：给定 SecretId/SecretKey/payload/time 断言 Authorization 头格式 `TC3-HMAC-SHA256 Credential=...` 及各头齐全。apiKey 解析函数 `parseTencentCredentials(apiKey)` 拆 `SecretId:SecretKey`，缺失/格式错 throw 中文提示。
- [ ] **Step 2:** 失败测试：①请求头包含 X-TC-Action/X-TC-Version/X-TC-Timestamp/Authorization；②Submit 返回 TaskId 后 Query 轮询 Status=Done 返回 VideoUrl；Fail 状态透出 Message
- [ ] **Step 3:** 实现：`POST https://hunyuan.tencentcloudapi.com`，Action=`SubmitHunyuanVideoJob` / `QueryHunyuanVideoJob`（⚠️ 连通性验证时对照腾讯云官方文档核对 Action 名与参数名，若有出入以文档为准修正）；body：`{ Prompt, ImageBase64?, Resolution?, EnableWatermark? }`；Query body `{ TaskId }`；状态 Done→VideoUrl、Fail→throw Message、Processing/Waiting→继续。无远端取消。
- [ ] **Step 4:** 测试通过；Commit `feat(video): 腾讯混元视频适配器与 TC3 签名`

### Task 7: 统一分发器 fetchVideoGeneration.ts

**Files:**
- Create: `src/renderer/src/pages/video/services/fetchVideoGeneration.ts`
- Test: `src/renderer/src/pages/video/services/__tests__/fetchVideoGeneration.test.ts`

**Interfaces:**
- Consumes: 三个适配器 + `isDashScopeProvider` + provider id 判定（ark/hunyuan 按 provider.id 或 apiHost 域名识别，仿 dashscope 的 host 识别法）。
- Produces:

```ts
export type FetchVideoParams = VideoGenParams & { onStatus?: VideoStatusCallback }
export async function fetchVideoGeneration(params: FetchVideoParams): Promise<string>
```

- [ ] **Step 1:** 失败测试：①provider.id='dashscope'→调百炼适配器；②'ark'/'hunyuan' 各路由正确；③自定义 apiHost 含 `volces.com`→ark、`tencentcloudapi.com`/`hunyuan`→hunyuan；④未知服务商 throw「该服务商暂不支持视频生成」
- [ ] **Step 2:** 实现（纯分发，~40 行）；测试通过
- [ ] **Step 3:** Commit `feat(video): 视频生成分发器与服务商路由`

### Task 8: 服务层 videoService.ts

**Files:**
- Create: `src/renderer/src/pages/video/services/videoService.ts`
- Test: `src/renderer/src/pages/video/services/__tests__/videoService.test.ts`

**Interfaces:**
- Consumes: fetchVideoGeneration、dbService/db、FileManager、createMessage/createVideoBlock/createMainTextBlock、NotificationService（全部仿 paintService 引法）。
- Produces:

```ts
export type GenerateVideoParams = {
  model: Model; prompt: string; inputImage?: string
  duration: string; resolution: string; aspectRatio?: string
  topicId?: string | null; assistantId?: string; signal?: AbortSignal
}
export async function generateVideo(params: GenerateVideoParams): Promise<{ topicId: string; topic?: Topic }>
export function abortCurrentVideoGeneration(): void
export async function enhanceVideoPrompt(prompt: string): Promise<string>   // 复用 paint 的翻译模型模式（提取共用或在本地复制小段，优先抽到公共模块）
```

- [ ] **Step 1:** 实现 generateVideo 主流程（仿 paintService.generatePaintImage）：建会话/消息/PENDING VIDEO 块 → onStatus 回调更新块 metadata.progress 文案（排队中/生成中+已用时）→ 成功后 `window.api.file.download(url, true)` + FileManager.addFile 持久化 → 块 SUCCESS（url 本地 URL，metadata 记原始 URL）→ 自动保存（saveGeneratedImages 思路改为保存视频文件；复用 settings.imageSavePath）→ 失焦通知「动感视频助手：视频生成完成」→ 中止落 PAUSED、失败落 ERROR（toSerializedError 可从 paintService 导出复用）。
- [ ] **Step 2:** 单测：成功流转（mock fetchVideoGeneration 与 window.api）、中止落 PAUSED、失败落 ERROR、下载失败保留远程 URL。
- [ ] **Step 3:** 测试通过；Commit `feat(video): 视频生成服务层与会话持久化`

### Task 9: UI 四件套

**Files:**
- Create/Replace: `pages/home/VideoWorkspace.tsx`（替换 Task 1 骨架）
- Create: `pages/video/VideoContent.tsx`、`pages/video/VideoHistoryList.tsx`、`pages/video/VideoInputbar.tsx`

**Interfaces:**
- Consumes: videoService、isVideoModel、store(llm.providers)、useAssistants/useTopicSet 等现有 hooks（引法照抄 PaintWorkspace 一族）。

- [ ] **Step 1:** VideoHistoryList：仿 PaintHistoryList（列表项显示会话名/时间/视频缩略块数量）
- [ ] **Step 2:** VideoContent：仿 PaintContent——按 topicId 读消息流，渲染 MAIN_TEXT 用户气泡 + VIDEO 块（复用 Blocks 的 VideoBlock 渲染或直接 `<MessageVideo>`）+ PENDING 状态卡（排队中/生成中+用时）+ ERROR 卡
- [ ] **Step 3:** VideoInputbar：模型下拉（`llm.providers` 全模型过滤 `isVideoModel`，无可用模型时空态引导去设置页添加）、提示词输入 + 「优化」按钮（enhanceVideoPrompt）、首帧图上传（转 base64 data URL，预览可删除）、胶囊参数：时长(5s/10s)、分辨率(480P/720P/1080P)、宽高比(16:9/9:16/1:1)、生成/停止按钮
- [ ] **Step 4:** VideoWorkspace 组装三件套（校验 activeTopic 归属，照抄 PaintWorkspace 的 validTopicId 逻辑）
- [ ] **Step 5:** typecheck 通过；手工冒烟：创建助手→选模型→输入提示词→点生成（未配 Key 时应得可读错误而非崩溃）
- [ ] **Step 6:** Commit `feat(video): 动感视频助手工作区 UI`

### Task 10: 收尾验收

- [ ] 全量 `npm run test`、`npm run typecheck`、lint 通过
- [ ] 逐文件审查本次 diff：无调试残留、无未用导出、注释中文、命名一致
- [ ] 真实 API 验收清单（需用户提供三家 Key）：百炼文生视频/图生视频、Ark 文生/图生、腾讯文生视频、各家的中途停止与失败展示、URL 过期前历史回放正常
- [ ] 最终 Commit 并汇总报告

## Self-Review 记录

- Spec 覆盖：设计文档 §4 架构→Task 1/7/8/9；§5.1→Task 2/3；§5.2→Task 4/5/6 inputImage + Task 9 上传；§5.3→Task 6；§5.4→Task 4-8 错误路径；§6 六步→Task 1-10 映射完整。
- 类型一致性：VideoGenParams/FetchVideoParams/generateVideo 签名在各 Task 间已对齐（公共类型单文件 videoGenerationTypes.ts 定义）。
- 无占位符：所有代码步骤给出真实代码或精确结构。
