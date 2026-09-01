# 【知识库】TAB 页开发设计方案

- 日期：2026-09-02
- 项目：cherry-studio-BB（1.7.4 定制分支）
- 状态：待评审（本文件为唯一设计依据，人工保存，不使用 GIT）

---

## 0. 决策记录（已与用户确认）

| 决策点 | 结论 |
|---|---|
| 实现路线 | B：在本分支内新建轻量知识库（不从官方 1.9/2.x 移植） |
| embedding 模型 | 本地（Ollama 等）与云端（OpenAI 兼容 `/embeddings`）双支持 |
| 向量存储层 | 纯 JS + IndexedDB（零原生编译依赖），不引入 sqlite-vec / LanceDB |
| MVP 范围 | 首版：单/多文件上传 + 混合检索 + 聊天引用 + 引用溯源；文件夹导入、rerank、OCR、网页入库放后续版本 |
| 版本控制 | 不使用 GIT，全部人工保存 |

---

## 1. 目标与定位

给本分支新增一个左侧导航 TAB【知识库】，实现完整 RAG 闭环：

```
添加文件 → 解析文本 → 智能切块 → 向量化入库 → 提问时混合检索 → 聊天模型引用片段作答 → 答案附原文溯源
```

与官方主线的对齐点：检索链路采用官方 2.0 同款成熟路线（解析 → 分块 → BM25 关键词 + 向量语义混合 → 合并 → TopK）。
刻意不做（YAGNI）：全文 RAG 之外的重型能力——多租户、云同步、WebDAV、多模态向量。

---

## 2. 现状盘点（已完成代码探查）

| 能力 | 现状 | 结论 |
|---|---|---|
| TAB/路由模式 | `Router.tsx` 用 HashRouter；`Sidebar.tsx` 的 `MainMenus` 有 `iconMap`/`pathMap`（assistants/minapp/notes/habits）；设置里 `sidebarIcons.visible` 控制显示 | 加 TAB = 加路由 + 图标 + 页面 |
| 本地数据库 | Dexie（IndexedDB），`databases/index.ts` 声明表，`databases/upgrades.ts` 函数式升级（upgradeToV5…） | 按同模式加 3 张表 |
| 模型体系 | `ModelType` 已含 `'embedding' | 'rerank'`；`config/models/embedding.ts` 有 `isEmbeddingModel()`；默认模型含 Qwen3 Embedding、OpenAI Embedding-3、Mistral Embed | 嵌入模型可选可配，无需新建设置 |
| embedding 调用 | `aiCore/AiProvider.ts` 已有 `getEmbeddingDimensions()`（返回 `result.embeddings[0].length`）；`services/ApiService.ts` 的 `checkApi` 已能针对 embedding 模型探测 | 底层嵌入 HTTP 调用已存在，需补"批量嵌入文本"封装 |
| 聊天引用组件 | `pages/home/Messages/CitationsList.tsx`、`citationCallbacks.ts` 已存在（消息内引用块渲染） | 引用溯源可复用该模式 |
| 本地文件读取 | Electron 渲染进程**不能直接读任意路径**，必须走主进程 IPC（`main/ipc.ts` + preload） | 文件读取必须新增 IPC 通道 |
| 关键词检索 | 无现成实现 | 引入纯 JS 全文检索库 |
| 向量索引 | 无现成实现 | 新增（纯 JS） |

---

## 3. 技术选型（全部纯 JS / 零原生编译）

| 环节 | 选型 | 理由 |
|---|---|---|
| 全文关键词检索 | `minisearch`（BM25，纯 JS）+ **自定义中文分词器** | 轻量可持久化；⚠️ MiniSearch 默认按空格分词会把中文整句当一个 token，**必须**自定义分词器（中文按相邻 2 字 bigram，英文按空格），否则中文关键词检索失效 |
| 向量相似度 | 首版用**暴力余弦**（不引 HNSW 库） | 个人规模 <5 万条块，暴力扫描毫秒级且精确；后续量级不够可换 `mememo`（HNSW，同为纯 JS/IndexedDB） |
| PDF 解析 | `pdfjs-dist`（Mozilla 官方，纯 JS/WASM） | 主流标准，支持 Electron |
| Word 解析 | `mammoth`（.docx → 文本/markdown，纯 JS） | 简单可靠 |
| Excel 解析 | `xlsx`（SheetJS CE，纯 JS） | 主流 |
| 切块 | 自研（见 §6.2），不引重型切分框架 | 控制行为、可测 |
| embedding HTTP | 复用现有 `AiProvider` 底层能力 + 新增批量封装（见 §6.3） | 与既有模型配置体系一致 |
| Web Worker | `new Worker(new URL(...))`（Electron 渲染进程支持） | 解析/切块/嵌入不卡 UI |
| 队列 | 自研轻量并发队列（并发数可配，默认 4） | 避免打爆云 API 限流 |

> 依赖安装：`pnpm add minisearch pdfjs-dist mammoth xlsx`（均可离线打入安装包）。

---

## 4. 架构总览

```
┌────────────────────────── 渲染进程（React） ──────────────────────────┐
│  UI 层：KnowledgePage（路由 /knowledge）· 聊天挂载选择器 · 引用渲染     │
│  服务层：KnowledgeService（队列/状态机）· FileReader(IPC) · Parser      │
│          Chunker · EmbeddingService · HybridRetriever                   │
│  Worker：parse-and-embed.worker.ts（解析+切块+批量嵌入+写库）            │
│  数据层：Dexie（kb_bases / kb_files / kb_chunks）+ MiniSearch 索引       │
└────────────────────────────────┬──────────────────────────────────────┘
                                 │ IPC（window.api.knowledge.*）
┌────────────────────────────────┴────────────────── 主进程 ─────────────┐
│  ipc.ts：新增 knowledge 通道 · fs 读取本地文件内容（按路径）             │
└─────────────────────────────────────────────────────────────────────────┘
  AI 服务：云端 OpenAI 兼容 /embeddings ── 或本地 Ollama /api/embeddings
```

**写库位置说明**：Web Worker 内可直接使用 IndexedDB（浏览器级 API），Dexie 官方支持在 Worker 中使用，向量与文本统一走 Worker 落库，避免主线程阻塞。

---

## 5. 数据模型（Dexie）

`databases/index.ts` 追加声明 + `databases/upgrades.ts` 追加一个升级函数（沿用现有函数式模式，版本号 = 当前最高版本号 +1，实现前先读 `upgrades.ts` 确认当前版本）。

共 **4 张新表**：`kb_bases` / `kb_files` / `kb_chunks` / `kb_search_index`（MiniSearch 索引持久化）。

### 5.1 kb_bases（知识库）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 主键（uuid） |
| name | string | 库名 |
| embedding_model_id | string | 建库时锁定的嵌入模型 id（**禁止中途更换**，见 §9-④） |
| embedding_provider_id | string | 模型所属 provider id |
| embedding_dim | number | 向量维度（建库时探测并固化） |
| created_at / updated_at | string(ISO) | 时间戳 |
| chunk_size / chunk_overlap | number | 切块参数（默认 1024/200 token，入库时生效） |

索引：`id`；附加字段 `embedding_model_id` 可建索引以便展示。

### 5.2 kb_files（文件）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 主键 |
| base_id | string | 所属库 |
| name / path / ext / size | string/number | 文件元信息（path 仅在本次会话内有效） |
| content_hash | string | 内容 SHA-256，**去重关键**（§6.5） |
| status | enum | `pending → parsing → chunking → embedding → ready / error` |
| error_message | string | 失败原因（供 UI 展示） |
| chunk_count | number | 切块数 |
| created_at / updated_at | string | 时间戳 |

索引：`base_id, status`（复合索引便于按库/状态查询）。

### 5.3 kb_chunks（切块 + 向量）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 主键 |
| base_id / file_id | string | 归属 |
| index | number | 块在文件内的序号 |
| text | string | 块文本（供引用溯源展示原文片段） |
| vector | Float32Array | 嵌入向量（1024 维 ≈ 4KB/条，5 万条 ≈ 200MB，磁盘无压力） |
| source | object | 原文位置：txt/md `{type:'line',lineStart,lineEnd}`；PDF `{type:'page',page}`；docx `{type:'para',paraStart,paraEnd}` |
| created_at | string | 时间戳 |

索引：`base_id, file_id, index`。

### 5.4 MiniSearch 索引持久化

MiniSearch 索引（BM25 词项表）序列化为 JSON，存一张 `kb_search_index` 表（key = base_id，value = 序列化索引 + 版本戳）。增量更新：新块就绪后局部 `add/remove` + 定期整体持久化。

---

## 6. 模块设计

### 6.1 文件读取（主进程 IPC）

- 渲染进程拿到文件路径（对话框选择）后，新增 IPC：`knowledge:read-file(path) → { buffer: ArrayBuffer, size }`。
- 主进程 `main/ipc.ts` 用 `fs.promises.readFile` 实现，限制单文件大小（默认 ≤ 100MB，超限报错提示）；**读取时一并计算内容 SHA-256**（`crypto`），一次 IO 两用，免二次读文件做去重。
- 理由：Electron 渲染器无任意路径读权限；音乐/笔记等 TAB 已用同模式（IPC + fs），保持一致。
- 边界：路径必须来自用户对话框选择（不能接受任意输入路径，避免越权读文件）。

### 6.2 解析与切块（Worker 内）

**解析器**（按扩展名路由）：
- `.txt/.md/.mdx/.json/.csv`：直接按 utf-8 读文本（带 BOM 检测兜底）。
- `.pdf`：`pdfjs-dist`，逐页 `getTextContent()` 提取，页面间插入分页标记；**Electron 下必须正确配置 `workerSrc`**（指向本地打包资源，不能用 CDN）。
- `.docx`：`mammoth.extractRawText()`；`.xlsx`：`xlsx` 读 sheet 逐行拼接文本。
- 其余扩展名（.ppt/.pptx/.epub 等）：首版报"暂不支持"，UI 友好提示。

**切块器**（策略，可测）：
1. 按 Markdown 标题（`#`/`##` 等）或空行拆分出"自然段"；
2. 自然段 ≤ chunk_size 直接成块；超过则按句末（`。！？；\n`）优先切分点进行滑动窗口切块，窗口 = chunk_size token，overlap = chunk_overlap token；
3. token 数估算（避免引重型 tokenizer）：中文按 1 字符 ≈ 1 token、英文按 4 字符 ≈ 1 token 粗估（仅用于切块，不影响正确性，偏保守即可）；
4. 每块记录位置信息 `source`：txt/md 记 `{ type: 'line', lineStart, lineEnd }`；PDF 记 `{ type: 'page', page }`（按页提取，行号无意义）；docx 记 `{ type: 'para', paraStart, paraEnd }`。

### 6.3 Embedding 服务（复用 AiProvider）

- 新增 `EmbeddingService`（渲染进程服务层）：
  - `getDimensions(provider, model)`：包装现有 `AiProvider.getEmbeddingDimensions()`；
  - `embedBatch(provider, model, texts[]): Float32Array[]`：**新增封装**——按现有 `AiProvider` 的请求构造方式批量调用 `/embeddings`（云端）或 `/api/embeddings`（本地 Ollama），内部处理批量上限（如每批 32 条）、超时（默认 60s）、重试（2 次退避）；
  - 本地/云端判别：provider 的 `baseUrl` 含 `localhost/127.0.0.1` 或用户显式标记 `type==='ollama'` 时走本地端点，否则走 OpenAI 兼容端点（两端口径都返回 `{ data: [{ embedding: number[] }] }` 结构，**接口归一**）。
- 关键约束：**建库时锁定的 embedding 模型与查询时使用同一模型**（官方文档明确：换模型 = 换"语义坐标系"，相似度计算失效）。库创建后 UI 锁定该字段，二次编辑需显式"重建索引"。
- **维度校验（数据完整性）**：每次 `embedBatch` 返回的向量维度必须等于建库时固化的 `embedding_dim`；不一致即报错（说明远端模型变更或配置错误），**禁止静默写入**——否则余弦相似度会算出错误结果。

### 6.4 检索器（HybridRetriever，纯内存 + 落库索引）

`search(baseId, query, topK=6)` 流程：
1. **关键词路**：MiniSearch 对 query 做 BM25 检索，取 topK×2 候选（携带 BM25 分数）；
2. **向量路**：query 经**同一嵌入模型**向量化 → 对该库全部向量做余弦相似度（首版暴力扫描；对该库缓存 `{ id → vector }` 于内存，随库变更失效），取 topK×2 候选；
3. **合并**：RRF（Reciprocal Rank Fusion，`score = Σ 1/(k + rank)`，k=60）融合两路排序，取 TopK；
4. 返回 `{ chunk, file, score, source }` 结构，附原始文本。
- 空库/未就绪：返回空并提示。
- **多库引用总控（防上下文膨胀）**：聊天同时挂载多个库时，引用块总数上限 8 块（或总 token ≈ 8K），按融合分数截断——否则多个库 × TopK 会把上下文塞爆。

### 6.5 入库状态机与去重

```
pending → parsing → chunking → embedding → ready
                └───────────────→ error（任一步失败，记 error_message，可"重试"）
```
- 去重：文件入库前计算 `content_hash`，同库同 hash 直接跳过（返回"已存在"提示）；
- 删除文件/库：级联删除 chunks + 从 MiniSearch 索引移除；删除动作可"取消进行中的处理"（AbortController）；
- 断点续传：应用重启后，`status ∈ {parsing, chunking, embedding}` 的条目标记为 `error(timeout)`，允许一键重试。

### 6.6 UI 设计

**KnowledgePage（路由 `/knowledge`）**：
- 左侧：知识库列表（卡片：名称、模型、文件数/块数、更新时间）；"+ 新建"按钮（弹窗：名称 + embedding 模型下拉[复用设置中已配置的 embedding 模型]）；
- 右侧主区：选中库的详情——文件列表（名称/大小/状态徽标/块数/错误原因/删除）+ "添加文件"按钮（多选对话框）；
- 顶部：`搜索知识库` 输入框（调 §6.4 的检索，展示 TopK 结果 + 匹配分数 + 原文片段，用于"召回测试"）；
- 空态引导：未建库 → "创建第一个知识库"；已建库无文件 → "添加文件"；无 embedding 模型 → 跳转设置页引导。

**聊天集成**：
- 输入栏（`Inputbar`）新增"知识库"按钮 → 弹出已建库多选列表 → 选中后发送消息时附带检索；
- 发送流程：检索各引用库 → 取 TopK（每库 6 块）拼装 `system` 提示（含"仅依据参考资料回答，无法回答时明确说明"）→ 走现有聊天模型流；
- 答案下方渲染引用块：复用 `CitationsList` 模式展示 `[来源: 文件名(行号) ]` + 可展开原文片段；
- 引用默认开启；可在消息工具栏随时开关。

### 6.7 现有代码接入点清单

| 接入点 | 文件 |
|---|---|
| 路由 | `src/renderer/src/Router.tsx`（+`/knowledge`） |
| 侧边栏图标 | `src/renderer/src/components/app/Sidebar.tsx`（iconMap/pathMap + `lucide-react` 图标如 `BookOpen`）；`types/index.ts` 的 `SidebarIcon` 联合类型 +1；`i18n/label.ts` 加标签；如走 `sidebarIcons.visible` 需在设置默认值补 `knowledge` |
| Dexie 表 | `src/renderer/src/databases/index.ts` + `upgrades.ts` |
| IPC | `src/main/ipc.ts` + `src/preload`（`knowledge:read-file`） |
| AI 调用 | `src/renderer/src/aiCore/AiProvider.ts`（新增批量嵌入封装） |
| 引用渲染 | `src/renderer/src/pages/home/Messages/CitationsList.tsx`（对齐 data 结构） |

---

## 7. 数据流（一次完整使用）

1. 用户点侧边栏【知识库】→ KnowledgePage → 新建库（选名称 + embedding 模型，探测维度入库）；
2. 添加文件（多选）→ IPC 读取内容 → 写入 `kb_files(pending)` → 派发 Worker；
3. Worker：解析 → 切块 → 批量 embedding（并发 4）→ 逐块写 `kb_chunks` + 增量更新 MiniSearch 索引 → 状态置 `ready`（每步进度经 postMessage 回报 UI 进度条）；
4. 聊天输入栏勾选该库 → 发送 → HybridRetriever 检索 TopK → 拼 system 提示 → 聊天模型流式生成 → 引用块渲染；
5. 随时可"删除文件/库"（级联清理 + 索引移除）或"重试失败文件"。

---

## 8. 错误处理清单

| 场景 | 处理 |
|---|---|
| 未配置任何 embedding 模型 | 建库界面禁用 + 引导按钮跳 `设置→模型服务` |
| 模型探测/维度过期失败 | 建库失败，提示检查模型服务与网络 |
| 文件读取失败（权限/不存在/超限） | 文件标 `error`，UI 显示具体原因 |
| 不支持的扩展名 | 选择时即过滤；误选则友好提示 |
| embedding 网络失败 | 自动重试 2 次（指数退避），仍失败标 `error` 可重试 |
| API 限流（429） | 并发队列自动退避（请求间隔 200ms 起步） |
| 检索结果为空 | 返回空 + 提示"可尝试换用词/检查库是否就绪" |
| 库在向量化中就被提问 | 按已就绪的块检索，并提示"库仍在处理中" |
| 中文乱码（GBK 等） | 读取时探测 BOM；非 UTF-8 中文文件首版提示手动转存（记录为已知限制） |

---

## 9. 风险登记册与对策（含"找 BUG"自查结论）

| # | 风险/隐患 | 对策 | 影响面 |
|---|---|---|---|
| ① | 渲染进程读不了本地文件 | 已定位：必须走主进程 IPC + fs（§6.1） | 正确性 |
| ② | 大文件/多文件处理卡 UI | Web Worker + 进度回报 + 可取消 | 体验 |
| ③ | 云端 embedding 并发打爆限流 | 并发队列（默认 4）+ 退避重试 | 稳定性 |
| ④ | **换 embedding 模型导致检索失效** | 建库锁定模型 + 维度固化；换模型必须显式"重新索引" | 正确性 |
| ⑤ | `pdfjs-dist` 在 Electron 的 worker 配置 | 打包内本地 `workerSrc`，严禁 CDN；构建时确认资源拷贝 | 正确性 |
| ⑥ | 向量存 IndexedDB 的内存占用（5 万块 ≈ 200MB） | 库级内存缓存按需加载 + LRU 释放；超 5 万块触发"建议拆分库"提示 | 性能 |
| ⑦ | MiniSearch 索引构建阻塞主线程 | Worker 内构建 + 增量更新 + 防抖持久化 | 性能 |
| ⑧ | 进程中断留下半成品状态 | 状态机 + 启动时清理中间态 + 一键重试（§6.5） | 健壮性 |
| ⑨ | 隐私：云端 embedding 会外发文本 | 建库时明确提示"该模型为云端，文件内容将发送至 {baseUrl}"，本地模型则标注"全程本机" | 合规 |
| ⑩ | 检索质量差（召回不到） | 内置"召回测试"搜索框（§6.6）；提示先查切块/嵌入而非换聊天模型（官方调优铁律） | 体验 |
| ⑪ | 与现有 `sidebarIcons.visible` 持久化兼容 | 老用户缺失字段自动兜底（现有代码已有该模式）；迁移脚本补默认值 | 兼容性 |
| ⑫ | Float32Array 经 structured clone 传输 Worker | 默认支持且高效；分批传输避免单消息过大（每批 ≤ 32 条向量） | 正确性 |
| ⑬ | **MiniSearch 默认分词器对中文失效** | 自定义分词器：中文按相邻 2 字 bigram、英文按空格（§3 已列）；单测必须含中文召回用例 | 正确性 |
| ⑭ | embedding 远端返回维度与固化维度不一致 | `embedBatch` 强校验 + 报错阻断写入（§6.3） | 数据完整性 |

---

## 10. 测试计划

**单元测试（vitest，与现有测试同目录 `__tests__/`）**
- `chunker.test.ts`：自然段切分、超长滑动窗口、重叠 token、中文行号记录；
- `retriever.test.ts`：RRF 合并排序、TopK 边界、空库、同库混合；
- `parser.test.ts`：txt/md 直读、BOM、分页标记；
- `embedding.test.ts`：批量上限切分、超时/重试逻辑（mock fetch）。

**集成测试（手动清单，小白可执行）**
1. 建库选本地/云端模型各一个 → 都能建成功；
2. 添加 1 个 txt + 1 个 pdf + 1 个 docx → 状态逐个到 `ready`，块数合理；
3. 同一文件再添加 → 提示"已存在"；
4. 搜索框召回测试：用原文关键词和同义改写各问一次，TopK 均含正确来源；
5. 聊天勾选库提问 → 答案依据文档 + 引用块可展开；
6. 删除文件/库 → 数据与索引同步清理；
7. 拔网线重试 embedding → 失败标 error，重试可恢复；
8. 重启应用 → 中间态可重试，已就绪数据可检索。

---

## 11. 分阶段实施计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| S0 | 验证 `AiProvider` 批量嵌入（探针脚本） | 本地/云端各成功嵌入一批文本 |
| S1 | Dexie 3 表 + 升级函数 + Sidebar 图标/路由/空页面 | 侧边栏出现【知识库】，路由可达 |
| S2 | IPC 文件读取 + 解析器（txt/md/pdf/docx） | 单测通过 |
| S3 | 切块器 + Worker 链路 + 状态机 + 进度 UI | 添加文件 → 全流程到 ready |
| S4 | EmbeddingService 批量封装 + 入库 | 块数与维度正确 |
| S5 | HybridRetriever（MiniSearch + 余弦 + RRF）+ 召回测试框 | 检索质量达标 |
| S6 | 聊天挂载 + 引用溯源渲染 | 端到端问答闭环 |
| S7 | 打磨：错误提示、空态、重试、删除级联、隐私提示 | 测试清单全过 |

每阶段独立验证后再进下一阶段；S2~S4 是核心风险区（解析/嵌入），优先。

---

## 12. 已知限制（如实声明）

- 首版不支持：文件夹导入、网页/URL、sitemap、OCR、rerank 重排、`.pptx/.epub`、GBK 编码文件；
- 非 UTF-8 中文文件需手动转存（可后续加 `iconv-lite` 支持）；
- 单库建议 ≤ 5 万块；超出提示拆分多库管理；
- 向量检索为精确暴力扫描（个人规模足够）；如未来量级暴涨，存储层可无缝换 `mememo`(HNSW)（同为纯 JS/IndexedDB，接口不变）。

---

## 13. 实现偏差记录（2026-09-02 实施后更新，文档与代码以代码为准）

| 方案描述 | 实际实现 | 原因 |
|---|---|---|
| Web Worker 解析/切块/嵌入 | **主线程异步流水线 + 进度回调** | 文件读取依赖主进程 `window.api`（preload 注入），Web Worker 拿不到，主线程分批 await 同样不阻塞 UI |
| 需引入 `iconv-lite` 支持 GBK | **无需新增**：复用现成 `window.api.fs.readText`（chardet+iconv 自动编码检测），GBK 开箱即用 | 现有能力已覆盖 |
| 引入 `pdfjs-dist` 解析 PDF | 复用现成 `window.api.pdf.extractText`（主进程已实现）；`pdfjs-dist` 虽已安装但未直接使用 | 避免重复造轮子（ponytail：现有能力优先） |
| 引入 `xlsx` | 使用已安装的 `@e965/xlsx` | 依赖已存在 |
| 聊天引用复用 CitationsList 块体系 | **最小可行**：发送时检索 → 把 `[文件名] 原文片段` 注入消息内容前缀 | 避免深改消息 block 体系（风险/范围可控），来源文件名即引用溯源 |
| 并发队列（默认 4） | 首版文件逐个串行处理（`await addFile` 循环） | 简化 + 天然规避云端 API 限流 |
| 侧边栏图标迁移 | 除默认值外，**在 `store/migrate.ts` 给老用户持久化 `visible` 补入 `knowledge`**（且尊重用户 disabled 禁用） | 老用户持久化数据不含新图标，不迁移则入口不可见（实测发现的问题） |
| 索引持久化（`kb_search_index` 表） | 改为**内存缓存 + 变更失效**（`invalidateIndex`），未落盘序列化 | 个人规模内存缓存足够，落盘序列化收益低 |
| 单库建议 ≤5 万块 | 同左，另加 `chunkCache` 内存缓存与失效 | 一致 |
---

## 14. 最终交付记录（v1.8.0，2026-09 完成）

### 已交付功能（全部实现并验证）

| 模块 | 说明 |
|---|---|
| 知识库 TAB | 侧边栏书本图标 + 路由 `/knowledge`；建库（选择嵌入模型）、多库管理、删除级联；老用户迁移补入口 |
| 文件导入 | 单个/多选（系统对话框 `multiSelections`）/文件夹递归（主进程 `Fs_ScanDir`：白名单/≤2000 文件/深度≤10/跳过隐藏与符号链接）；txt/md/mdx/csv/json/pdf/docx/xlsx；GBK 自动识别 |
| RAG 流水线 | 解析→智能切块（可调 256~2048 + 重叠）→ embedding（`AiProvider.embedTexts` 批量、维度强校验、云端/本地双支持）→ 事务落库；SHA-256 去重；状态机 pending→…→ready/error |
| 混合检索 | MiniSearch BM25（中文 bigram 分词）+ 向量余弦 + RRF 融合 + TopK；每库缓存 + 变更失效；向量路失败降级关键词 |
| 四栏详情页 | 知识库列表(固定 220px) / 文件列表(20%) / 对话查询(30%) / 文件内容(50%)；双拖拽分隔条；窗口 resize 按比例重算（拖拽后锁定）；命中点击查看完整原文 + 复制按钮 + 正文可选中 |
| 聊天集成 | 输入栏原生 `knowledge` 工具（QuickPanel 多选、`#` 符号、勾选即时生效、角标计数）；发送时检索注入参考资料（**8 块上限防上下文膨胀**） |
| 知识库设置 | 每库切块大小/重叠/TopK；**未手动设置时按所选模型推荐默认**（bge/text-embedding→512/80/6，qwen/gte→1024/200/6，兜底 1024/200/6） |

### 测试与验证

- 知识库单测：parser（normalize/hash/extractExt）、chunker（切块/重叠/行号/单行超长）、embedding（batch/维度校验）、retriever（分词/余弦/RRF）、defaults（模型推荐）、knowledgeQuickPanel（面板构建/勾选收集）等 **46 测试**
- 迁移测试 13；改动相关全量 856 测试；**全项目 224 文件 / 3716 测试全绿**；三端 typecheck（node/aiCore/web）+ biome lint 全绿

### 审查修复记录（v1.8.0 内）

1. 老用户 `sidebarIcons.visible` 缺 `knowledge` → migrate 补入（尊重 disabled 禁用）
2. QuickPanel 勾选时序：`ctx.list` 回调时为异步旧值 → 改为**同步收集器**（`updateSelection` 基于回调携带的已更新 item）
3. Node Buffer 池化大数组 → hash 与 mammoth 解析均按实际长度切片
4. 处理中删除文件的竞态 → 落库事务内检查文件存在，防无主 chunk
5. 聊天注入无总量限制 → 引用块**封顶 8 块**
6. 无扩展名/隐藏文件 ext 提取错误 → `extractExt`（点须在分隔符后且文件名不以点开头）
7. 检索结果孤儿 chunk 防御（file 缺失跳过）；删除死代码
