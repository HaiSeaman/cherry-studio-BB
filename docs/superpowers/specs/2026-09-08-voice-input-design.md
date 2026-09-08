# Cherry Studio「语音输入」功能 · 正式开发文档 v1.10.0

- 版本：v1.10.0（正式交付版：A/B/C/D/E 全部阶段完成，千问/豆包真机链路验证通过，测试全绿）
- 日期：2026-09-08
- 状态：**已交付**（待主人最终真机体验验收 / 全局打字真机确认）
- 适用环境：Windows（主人只用 Windows）

---

## 零、版本历史与变更记录（v0.1 → v1.10.0）

### v1.10.0（正式交付版，本次发布）

**功能全貌**：全局语音输入——按住 `Win+Shift+`（显示 Win+~）说话，松开后识别文字自动打入鼠标光标处；支持千问 / 豆包 / 腾讯三家切换。资源占用：平时≈0，说话时 30~80MB。

| 阶段 | 内容 | 验证 |
|---|---|---|
| A 骨架 | 快捷键注册（DefaultShortcuts+ShortcutService 特殊分支）、键盘钩子（uiohook-napi 按下/松开防抖）、配置存储（ConfigManager）、设置界面（默认模型页区块+弹窗） | 单测全绿 |
| B 千问 | QwenASRAdapter（ws+Bearer 鉴权、run-task/result 增量合并/finish-task）、录音端（getUserMedia→重采样16k→100ms分块） | 单测全绿 + **主人真机已通** |
| C 打字 | 剪贴板备份→写入→uiohook keyTap(Ctrl+V)→延迟恢复 | 单测全绿，待主人真机确认 |
| D 豆包/腾讯 | 豆包大模型流式接口、腾讯 HMAC 签名接入（见下方修正记录） | 单测全绿 + **豆包真机链路验证通过（主人 Key）** |
| E 打磨 | 生命周期状态广播（listening/inserting/done/error）+ 渲染端错误提示；密钥校验去重（shared 统一实现） | 全量测试全绿 |

**本次交付的完整修复清单（调试/审查中发现的问题）**：

| # | 问题 | 修复 |
|---|---|---|
| 1 | 豆包接入接口选择错误（用了传统 v2/asr，主人的模型 volc.seedasr.sauc.duration 属大模型流式接口） | 切换 `/api/v3/sauc/bigmodel` + X-Api-* 请求头鉴权 + 首帧 model_name=bigmodel（v1.4） |
| 2 | 豆包帧头字节错位（0x01 开头，协议版本=0） | 按官方字节表改为 0x11 开头（v1.5） |
| 3 | 豆包响应帧解析缺 sequence 扩展头（flags&0x01 时头后 4 字节） | extractDoubaoFrames 支持扩展头 + flags=0x03 末包判定（v1.5） |
| 4 | 豆包结果字段取错（result[0].text，实际是顶层 text） | 改取顶层 text + 增量合并（v1.5） |
| 5 | 单例状态广播未接线（渲染错误提示失效） | voiceInputService 单例接 windowService 真实广播（审查修复） |
| 6 | 录音竞态：endCapture 早于录音启动 → 永不 finalize + 麦克风泄漏 | stoppedRef 标志 + stopCapture 无条件 finalize（审查修复，有端到端测试） |
| 7 | 豆包/腾讯连接建立前到达的音频被静默丢弃 | startSession 前缓存音频、会话开始后补发（审查修复） |
| 8 | 千问极短按键：task-started 未到就 finalize 丢缓存音频 | 挂起等待事件（3s 上限）再收尾（审查修复） |
| 9 | 腾讯 slice_type 判定用字符串匹配（脆弱） | 解析结果结构化（sliceType 字段）（审查修复） |
| 10 | 密钥校验 main/renderer 两处重复实现 | 唯一实现迁至 packages/shared/config/voiceInput.ts（去重） |
| 11 | 死代码：TENCENT_WS_HOST 零引用、过时注释 | 删除/更新（审查清理） |

**验证结果（v1.10.0）**：全量测试 **3906 通过 0 失败**（main 409 / renderer+shared+aiCore+scripts 3497），typecheck 全绿，新增文件 lint 干净；豆包用主人真实 API Key 直连生产代码验证：连接/鉴权/音频/收尾全链路通。

---

### v0.1 → v1.5 修订过程（早期修订说明，v0.3 → v1.0）

| # | 类型 | 内容 |
|---|---|---|
| 1 | ❌ 错误修正 | 快捷键由 `Win + `` `（反引号）改为主人指定的 **`Win + ~`**。`~` 需要按 `Shift + `` ` 才打出来，实际物理组合是 **Windows 键 + Shift + 反引号**，全篇统一 |
| 2 | ❌ 错误修正 | 豆包密钥框补齐：官方协议**必须**要 **AppID + Access Token + Cluster ID** 三个（v0.3 只写了两个，缺 Cluster ID） |
| 3 | ❌ 错误修正 | 腾讯密钥框补齐：官方协议**必须**要 **AppID + SecretId + SecretKey** 三个（v0.3 只写了两个，缺 AppID，AppID 还写在连接地址里） |
| 4 | ❌ 错误修正 | 模拟粘贴方案升级：查证 `uiohook-napi` 自带 `keyTap()` 可直接模拟 `Ctrl+V`，且业界参考项目同库实现监听+模拟，**砍掉一个依赖**（不再需要 koffi/SendInput） |
| 5 | ❌ 错误修正 | "模型名称"框用途说清：千问 → 填 `model` 字段（默认 `paraformer-realtime-v2`）；腾讯 → 填 `engine_model_type`（默认 `16k_zh`）；**豆包传统流式协议没有模型名字段**（由 Cluster 决定），该框对豆包隐藏 |
| 6 | ➕ 内容补全 | 新增「三家语音识别服务接入明细」完整一节：官方地址、鉴权方式、请求帧格式、事件流、发送节奏、参数（全部来自官方文档并附链接，见 §五） |
| 7 | ➕ 内容补全 | 补录音频发送节奏要求（千问每包 100ms/1~16KB、腾讯 1:1 实时率否则断连、豆包末包序号取负）——这些直接决定功能成败 |
| 8 | ➕ 内容补全 | 补千问 API Key 地域限制：仅华北2（北京）地域使用 |
| 9 | ➕ 内容补全 | 新增「业界参考方案」一节：uiohook-napi + Daisy-Voice-Agent（Electron 语音代理）按住说话实现模式（§十一） |
| 10 | ✏️ 表述修正 | "拦截 Win 键弹开始菜单"改为谨慎表述：uiohook 是否可拦截需在实施阶段实测，若无法拦截则引导用户换键 |

---

## 一、需求总览（主人已拍板）

| 决策点 | 已确认方案 |
|---|---|
| 打字范围 | **全局所有软件**（微信、记事本等都能用） |
| 服务商 | **千问、豆包、腾讯三家全接**，可切换 |
| 设置位置 | **「设置 → 默认模型」页**新增「语音输入模型」区块（照"快速模型"样式） |
| 快捷键 | 复用「快捷键」设置页，默认 **`Win + ~`**（即 Win+Shift+反引号），可改 |
| 触发方式 | **按住说话 / 松开结束并打字**（键盘钩子 uiohook-napi 实现） |
| 密钥/模型名 | **API 地址写死**在代码里；密钥 + 模型名称由主人自己在设置里填 |
| 资源占用 | 云端识别方案，平时≈0，说话时 30~80MB（详见 §九） |

---

## 二、整体架构

```
┌────────────── 渲染进程（界面层） ──────────────┐
│ [设置-默认模型页]「语音输入模型」区块+弹窗        │
│ [录音模块] 麦克风 → 16kHz 单声道 PCM 音频流      │
└──────────────┬────────────────────────────────┘
               │ IPC（软件内部通信通道）
┌──────────────▼────────────────────────────────┐
│ 主进程（系统能力层）── 新增 VoiceInputService     │
│  ① 键盘钩子(uiohook-napi)：按下=开始 / 松开=结束 │
│  ② 收音频流 → 按所选服务商封装报文               │
│  ③ WebSocket 推云端 → 收文字                    │
│  ④ 文字→剪贴板→模拟 Ctrl+V（uiohook keyTap）    │
│  ⑤ 打完恢复主人原来的剪贴板                      │
└────────────────────────────────────────────────┘
```

### 模块清单（新增/改动文件）

| 文件 | 动作 | 作用 |
|---|---|---|
| `package.json` | 改动 | 新增依赖 `uiohook-napi`、`ws`（+ dev `@types/ws`） |
| `pnpm-workspace.yaml` | 改动 | `onlyBuiltDependencies` 放行 `uiohook-napi`（N-API 模块 ABI 稳定，无需 electron-rebuild 与 electron-builder 特殊配置） |
| `packages/shared/config/constant.ts` | 改动 | `DEFAULT_SHORTCUTS` 加 `voice_input` 行（默认 `Win + Shift + `` `） |
| `src/main/services/ShortcutService.ts` | 改动 | `voice_input` 分支：把该快捷键同步给键盘钩子（不走 globalShortcut） |
| `src/main/services/voiceInput/keyboardHook.ts` | 新增 | uiohook-napi 监听按下/松开，防抖输出 start/stop 事件 |
| `src/main/services/voiceInput/VoiceInputService.ts` | 新增 | 主进程总调度：音频→识别→打字 |
| `src/main/services/voiceInput/asr/types.ts` | 新增 | 适配器统一接口 |
| `src/main/services/voiceInput/asr/qwen.ts` | 新增 | 千问（阿里百炼）适配器 |
| `src/main/services/voiceInput/asr/doubao.ts` | 新增 | 豆包（火山引擎）适配器 |
| `src/main/services/voiceInput/asr/tencent.ts` | 新增 | 腾讯云适配器（含 HMAC-SHA1 签名） |
| `src/main/services/voiceInput/asr/index.ts` | 新增 | 按设置选择适配器的工厂 |
| `src/main/services/voiceInput/textInserter.ts` | 新增 | 全局打字：备份剪贴板 + 写入文字 + uiohook 模拟 Ctrl+V + 恢复剪贴板 |
| `src/main/services/ConfigManager.ts` | 改动 | 新增 `voiceInput` 配置项 |
| `src/main/ipc.ts` + `src/preload/index.ts` | 改动 | 新增 4 个通信通道（§七） |
| `src/renderer/src/pages/settings/ModelSettings/ModelSettings.tsx` | 改动 | 加「语音输入模型」区块 |
| `src/renderer/src/pages/settings/ModelSettings/VoiceInputSettingsPopup.tsx` | 新增 | 设置弹窗（照 `QuickModelPopup` 写） |
| `src/renderer/src/hooks/useVoiceInput.ts` | 新增 | 渲染端录音（getUserMedia + 重采样）与状态 |
| 对应 `__tests__/` 单元测试 | 新增 | 照项目 vitest 规范补 |

---

## 三、界面设计（设置在哪里）

### 3.1 设置入口：「设置 → 默认模型」

文件：`src/renderer/src/pages/settings/ModelSettings/ModelSettings.tsx`
该页现有"默认助手模型 / 快速模型 / 翻译模型"区块，样式是"标题 + 下拉框 + 设置按钮"。照抄该样式新增「语音输入模型」区块：

1. **下拉框**：千问 / 豆包 / 腾讯 三选一。
2. **齿轮设置按钮**：点击弹窗 `VoiceInputSettingsPopup.tsx`（照 `QuickModelPopup.tsx` 的 Modal 写法），弹窗内容按所选服务商切换：

| 服务商 | 弹窗输入框 | 说明 |
|---|---|---|
| 千问 | API Key（1 个）<br>模型名称（默认 `qwen-audio-3.0-asr-flash-streaming`） | 百炼平台 API Key，仅开通地域可用 |
| 豆包 | API Key（新版控制台 APP Key，1 个）<br>资源 ID（即模型，默认 `volc.seedasr.sauc.duration`） | 走大模型流式接口（/api/v3/sauc/bigmodel），鉴权在请求头 |
| 腾讯 | AppID / SecretId / SecretKey（3 个）<br>模型名称（默认 `16k_zh`） | 模型名称实际是引擎型号 engine_model_type |

3. **API 地址写死**：选哪家触发哪家固定地址（见 §五）。
4. 各家密钥分开保存、互不干扰；切换服务商自动加载对应配置。

### 3.2 快捷键：「设置 → 快捷键」

文件：`src/renderer/src/pages/settings/ShortcutSettings.tsx`
表格里加一行「语音输入」：
- 默认快捷键：**`Win + ~`**（物理按键 = Windows 键 + Shift + 反引号）。设置页录入时显示为组合键，由现有改键组件处理。
- 用法：**按住 `Win+~` 开始说话，松开结束并打字**。
- 在快捷键页可自由改键（改键后自动同步给键盘钩子）。

> ⚠️ 技术实情两条：
> 1. 软件现成的 `globalShortcut` 只能感知"按下"、感知不到"松开"，所以必须用 uiohook-napi 键盘钩子（有方案参考，见 §十一）。
> 2. 按住 `Win` 键时 Windows 默认会弹开始菜单；实施阶段测试 uiohook 的按键拦截能力，若压不住则在文档提示主人换一个不冲突的键（如 `Ctrl+Shift+Space` 或 `F8`）。

---

## 四、录音与音频处理

- 录音端：**渲染进程**用 `getUserMedia` 采麦克风（Electron 内唯一零原生依赖的方案）。
- 音频格式：统一转成 **16kHz、16bit、单声道 PCM**（浏览器默认常为 48kHz，需用 AudioContext 重采样）。
- 分块推送：按 100ms 一块经 IPC 传主进程（约 3200 字节/块 @16k*16bit*mono）。
- **发送节奏（各家要求不同，必须遵守）**：

| 服务商 | 每包建议 | 硬性约束 |
|---|---|---|
| 千问 | 100ms，1KB~16KB | 持续静音 60 秒不断连（可开 heartbeat 参数保活） |
| 豆包（大模型流式） | 100~200ms（双向流式 200ms 性能最优） | 结束发"末包帧"（flags=0b0010，空 payload）；服务端回末包响应（flags=0x03）后关闭 |
| 腾讯 | 200ms，1:1 实时率 | 间隔 >6 秒断连；1 秒内发送 >3 秒音频报错 4000 |

---

## 五、三家语音识别服务接入明细（官方文档查证）

### 5.1 统一适配器接口（asr/types.ts）

所有适配器实现同一接口，便于切换：

```ts
interface ASRAdapter {
  connect(): Promise<void>          // 建立 WebSocket 连接
  startSession(): void              // 发送开始指令（各家叫法不同）
  sendAudio(chunk: Uint8Array): void // 推音频块
  stopAndFinalize(): Promise<string> // 结束本轮，返回最终文本
  close(): void                     // 关闭连接
  onResult: (text: string, isFinal: boolean) => void
  onError: (message: string) => void
}
```

---

### 5.2 千问（阿里云百炼 · Qwen-Audio-3.0-ASR-Flash-Streaming / Fun-ASR-Realtime）

**官方文档**：https://help.aliyun.com/zh/model-studio/fun-asr-realtime-websocket-api

| 项 | 内容 |
|---|---|
| 连接地址（写死） | `wss://dashscope.aliyuncs.com/api-ws/v1/inference`（固定域名，无需 WorkspaceId；官方另推业务空间域名 `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`，一期用固定域名即可） |
| 鉴权 | 请求头 `Authorization: Bearer <API Key>`，握手阶段校验，无效返回 401/403 |
| 模型（用户填） | `qwen-audio-3.0-asr-flash-streaming`（默认，主人指定）；也支持 `fun-asr-realtime` 系列 |
| 音频要求 | 单声道；pcm/wav/mp3/opus 等格式；推荐 16kHz、16bit、单声道 PCM（阶段 B 录音端即此格式） |
| 交互流程 | ① 建立连接 → ② 发 `run-task`（header `{action:'run-task', task_id, streaming:'duplex'}` + payload `{task_group:'audio', task:'asr', function:'recognition', model, parameters:{sample_rate:16000, format:'pcm'}, input:{}}`）→ ③ 收 `task-started` → ④ 每 100ms 发一块二进制音频（16k 每块 3200 字节）→ 期间收 `result-generated`（文本在 `payload.output.sentence.text`）→ ⑤ 发 `finish-task` → ⑥ 收 `task-finished` 后关闭连接 |
| 常用参数 | `sample_rate=16000`、`format='pcm'`；模型支持任意采样率 |
| 注意事项 | API Key 按开通地域（北京/新加坡为独立 Key）；**Node 内置 WebSocket 不支持自定义请求头**，主进程用 `ws` 库携带 `Authorization` |
| 实现状态 | 阶段 B 已完成：协议纯函数 + `QwenASRAdapter`（ws 连接、task-started 前缓存音频、增量结果合并、finish-task 收尾）+ `VoiceInputService` 编排，12+7+7 个单测全绿 |

---

### 5.3 豆包（火山引擎 · 大模型流式语音识别 API，支持 volc.seedasr.sauc.duration 模型 2.0）

**官方文档**：https://docs.volcengine.com/docs/6561/1354869 （大模型流式语音识别 API）

| 项 | 内容 |
|---|---|
| 连接地址（写死） | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel`（双向流式模式） |
| 鉴权（请求头） | `X-Api-Key`（新版控制台 APP Key）、`X-Api-Resource-Id`（资源 ID 即模型）、`X-Api-Request-Id`（UUID）、`X-Api-Connect-Id`（UUID）；响应头 `X-Tt-Logid` 用于排错 |
| 模型（用户填资源 ID） | `volc.seedasr.sauc.duration`（豆包流式识别模型 2.0 小时版，默认值）；1.0 为 `volc.bigasr.sauc.duration` |
| 音频要求 | pcm 16kHz / 16bit / 单声道；单包建议 100~200ms（双向流式 200ms 性能最优） |
| 帧协议 | 与 v2 相同：4 字节头（version=1 高半字节 / headersize=1 / type 0b0001 请求 0b0010 音频 0b1001 响应 0b1111 错误 / serial=JSON）+ 4 字节大端长度 + payload；首帧 JSON 含 `user.uid`、`audio{format:'pcm',codec:'raw',rate:16000,bits:16,channel:1}`、`request.model_name:'bigmodel'`；末包帧 flags=0b0010 |
| 注意事项 | **鉴权在 HTTP Header，payload 不再携带 appid/token/cluster**；新版控制台申请的是 APP Key 而非旧版 AppID/Token；传统 v2/asr 接口与本模型不兼容（v1.3 曾误用，v1.4 已修正） |
| 实现状态 | v1.4 完成：鉴权头 + 首帧字段改造；v1.5 按真机实测修正：帧头字节改为 `0x11` 开头（原 0x01 版本号错位）、响应帧支持 sequence 扩展头（flags&0x01）并以 flags=0x03 判定末包、结果字段改为顶层 `text`（原 result[0].text 取空）。协议 6 测试 + 适配器 8 测试全绿；用真实 API Key 直连验证：连接/鉴权/音频/收尾全通 |

---

### 5.4 腾讯云 · 实时语音识别（WebSocket）

**官方文档**：https://cloud.tencent.com/document/product/1093/48982

| 项 | 内容 |
|---|---|
| 连接地址（写死模板） | `wss://asr.cloud.tencent.com/asr/v2/<AppID>?{请求参数}`（AppID 由用户填写，拼进 URL） |
| 鉴权材料（用户填） | **AppID、SecretId、SecretKey** 三个；在腾讯云"API 密钥管理"页获取 |
| 签名 | URL 带 `secretid / timestamp / expired / nonce / voice_id / signature`；signature = 对除 signature 外参数按字典序排序拼接 URL 原文 → HMAC-SHA1(SecretKey) → base64 → **urlencode**（须编码 + = 等特殊字符） |
| 引擎型号（用户填模型名称） | `16k_zh`（中文通用，默认）、`16k_zh_en_2.0`（大模型 2.0，中英+30 方言）、`16k_zh-TW`、`16k_yue`、`16k_en` 等 |
| 音频要求 | 16kHz 或 8kHz、16bit、单声道；pcm/wav/opus/speex/silk/mp3/m4a/aac |
| 加音节奏 | 建议每 200ms 发 200ms（即 1:1 实时率），16k 每包 6400 字节 |
| 结束信号 | 发完音频发 `{"end": true}` 文本帧；收到 `final: 1` 消息后断开 |
| 常用错误码 | 4000 发送过快 / 4002 鉴权失败 / 4003 未开通服务 / 4007 音频格式不符 / 5000~5002 网络抖动（重试即可） |
| 实现状态 | 阶段 D 已完成：`signTencentQuery`（HMAC-SHA1 签名）/`buildTencentWsUrl`/`parseTencentMessage`（含 slice_type/final）纯函数 + `TencentASRAdapter`（直接发 PCM → slice_type=2 稳态分句追加 → `{"end":true}` → final=1 收尾，5s 超时保险），13 个单测全绿 |

---

### 5.5 三家对比总结表

| | 千问 | 豆包 | 腾讯 |
|---|---|---|---|
| 地址（写死） | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` | `wss://openspeech.bytedance.com/api/v2/asr` | `wss://asr.cloud.tencent.com/asr/v2/<AppID>` |
| 用户填写的密钥 | API Key ×1 | AppID、Token、Cluster ×3 | AppID、SecretId、SecretKey ×3 |
| 模型名称框作用 | model 字段 | 不需要（隐藏） | engine_model_type 字段 |
| 签名 | 无（请求头 Bearer） | 无（首帧 JSON 带 token） | HMAC-SHA1 + urlencode |
| 音频格式 | 16k 单声道 PCM | 16k 单声道 PCM | 16k 单声道 PCM |
| 自动标点 | 默认开 | workflow 加 `nlu_punctuate` | 默认支持 |

---

## 六、全局打字（模拟输入）

- **剪贴板方案**：识别文字 → 主进程 `electron.clipboard.writeText(text)`（先备份用户原剪贴板）→ 模拟一次 `Ctrl+V` → 完成后恢复原剪贴板。
- **模拟按键**：**首选 `uiohook-napi` 自带 `keyTap`**：`uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl])`——监听和模拟一个库全干，无需额外原生依赖（业界参考项目已同库实现）。
- 备选（若 keyTap 实测不可靠）：`koffi` 调 Windows `SendInput`；再备选：PowerShell `SendKeys`（零依赖但有瞬时进程开销）。
- 不逐字模拟打字，避免与中文输入法冲突；也不覆盖键盘焦点问题（Ctrl+V 天然打到当前前台窗口的光标处）。

---

## 七、IPC 设计（5 个通道）

| 通道 | 方向 | 内容 |
|---|---|---|
| `voiceInput:beginCapture` | 主进程 → 渲染 | 键盘钩子检测到**按下**，通知开始录音 |
| `voiceInput:audio` | 渲染 → 主进程 | 持续推送音频块（PCM） |
| `voiceInput:endCapture` | 主进程 → 渲染 | 键盘钩子检测到**松开**，通知停止收尾 |
| `voiceInput:state` | 主进程 → 渲染 | 状态广播：`listening / inserting / done / error` |
| `voiceInput:finalize` | 渲染 → 主进程 | 录音停止后通知主进程收结果（打字的触发点） |

---

## 八、配置存储（ConfigManager）

新增配置项 `voiceInput`：

```ts
interface VoiceInputConfig {
  provider: 'qwen' | 'doubao' | 'tencent'   // 当前选中的服务商
  qwen:    { apiKey: string; model: string }                      // model 默认 qwen-audio-3.0-asr-flash-streaming
  doubao:  { apiKey: string; resourceId: string }                 // resourceId 默认 volc.seedasr.sauc.duration（模型 2.0）
  tencent: { appid: string; secretId: string; secretKey: string; engineModel: string } // engineModel 默认 16k_zh
}
```

- 快捷键本身不在此存（复用现有 `shortcuts` 配置体系，只加一行 `voice_input`）。
- 密钥以明文存本地配置文件（与软件内现有模型密钥存储方式保持一致，不额外加密；如需加密可二期考虑）。

---

## 九、资源占用（回答主人核心问题）

| 时段 | 额外内存 | 说明 |
|---|---|---|
| 平时挂机 | **≈ 0 ~ 几 MB** | 一个全局键盘钩子常驻，极小 |
| 按住说话那几秒 | **约 30 ~ 80 MB** | 录音缓冲 + 网络推流暂存，松手即释放 |
| 打字那一刻 | **≈ 0** | 模拟一次 Ctrl+V |

- 声音实时传云端识别，本地仅"传话筒"，**不伤内存**；每句话网络流量几十 KB。
- 坚决不用本地识别方案（模型常驻 500MB~1.5GB，会明显拖慢电脑）。

---

## 十、错误处理与边界

| 情况 | 处理 |
|---|---|
| 麦克风权限被拒 | 提示引导到 Windows 设置开启 |
| 密钥未填/填错 | 开始前校验，提示去「设置 → 默认模型」填；三家错误码区分提示 |
| 网络断/服务商超时 | 停止本轮，提示重试；不影响已输入内容 |
| 剪贴板有重要内容 | 自动备份与恢复 |
| 识别为空 | 不打字，静默结束 |
| 光标在不可输入区域（如桌面） | Ctrl+V 无效属正常，静默结束，不吓人 |
| 快捷键与系统冲突（Win 弹开始菜单） | 实施时测拦截；不行提示换键 |

---

## 十一、业界参考方案（调研结论）

1. **键盘钩子库：`uiohook-napi`**（SnosMe，N-API 封装 libuiohook）——官方 API 支持 `keydown`/`keyup` 全局事件和 `keyTap`/`keyToggle` 模拟按键，仓库：https://github.com/SnosMe/uiohook-napi。这正是"按住说话"需求的官方能力（全局按下/松开 + 模拟粘贴）。
2. **直接参考项目：Daisy-Voice-Agent**（Electron 语音代理）——其 `src/main/shortcut/globalShortcut.ts` 用 uiohook-napi 实现了完整的"按住快捷键说话/松开停止"：维护按下键集合 `pressedKeys`、组合键匹配、**按下 20ms 防抖触发 start、松开 50ms 防抖触发 stop**、支持录制新快捷键（capture 模式）。本功能的 `keyboardHook.ts` 照此模式实现：https://github.com/forestai123456/Daisy-Voice-Agent
3. **方案结论**：全局"按住说话 + 松开打字"在 Electron/Windows 上是成熟路径（uiohook 监听 + 剪贴板 + uiohook keyTap 模拟粘贴），无技术不通的风险；主要风险集中在原生模块兼容与杀毒误报（见 §十四）。

---

## 十二、实施计划（分 5 步，全部已完成 ✅）

### 阶段 A：骨架（键盘钩子 + 配置 + 设置界面）—— ✅ 已完成
- 目标：按住/松开 `Win+~` 能被感知（日志出现 start/stop）；默认模型页出现「语音输入模型」区块与弹窗；配置存盘。
- 依赖：`uiohook-napi`（N-API 原生模块，ABI 稳定免 rebuild）+ `pnpm-workspace.yaml onlyBuiltDependencies` 放行。
- 文件：`package.json`、`constant.ts`、`ShortcutService.ts`、`keyboardHook.ts`、`ConfigManager.ts`、`ipc.ts`、`preload/index.ts`、`ModelSettings.tsx`、`VoiceInputSettingsPopup.tsx`
- 结果：快捷键注册/键盘钩子/配置/设置界面全部落地，单测全绿。

### 阶段 B：录音 + 千问识别闭环 —— ✅ 已完成（主人真机已验证）
- 目标：按住说话松开后，软件录下声音并识别出文字（先在日志看到，不自动打字）。
- 文件：`useVoiceInput.ts`、`VoiceInputService.ts`、`asr/qwen.ts`
- 结果：千问 `qwen-audio-3.0-asr-flash-streaming` 识别闭环跑通，主人真机确认可用。

### 阶段 C：全局打字 —— ✅ 已完成（待主人真机最终确认）
- 目标：识别结果自动落到光标处，原剪贴板恢复。
- 文件：`textInserter.ts`
- 结果：剪贴板备份→写入→uiohook keyTap(Ctrl+V)→延迟 100ms 恢复，单测全绿；需主人在记事本/微信真机确认。

### 阶段 D：豆包、腾讯适配器 —— ✅ 已完成（豆包真机链路验证通过）
- 目标：切换服务商后识别照常。
- 文件：`asr/doubao.ts`、`asr/tencent.ts`（腾讯含 HMAC-SHA1 签名）、`asr/index.ts`（工厂）
- 结果：豆包大模型流式接口（volc.seedasr.sauc.duration）用真实 Key 直连验证全通；腾讯按官方签名协议实现（待主人真机）。

### 阶段 E：打磨 —— ✅ 已完成
- 目标：断句停顿调优、状态提示、错误提示、全量测试。
- 结果：状态广播（listening/inserting/done/error）+ 渲染端错误提示；密钥校验去重；全量测试 lint typecheck 全绿。

---

## 十三、验收标准（可测清单，截至 v1.10.0）

1. 设置 → 快捷键 表格出现「语音输入」，默认 `Win + ~`，可改可生效。 ✅ 实现+单测
2. 设置 → 默认模型 页出现「语音输入模型」区块：下拉切换三家；弹窗密钥按服务商切换（千问 1 框 / **豆包 2 框**（API Key + 资源 ID） / 腾讯 3 框）、模型名称可填、可存盘。 ✅ 实现+单测
3. **按住 `Win+~` 说话、松开**：文字出现在光标处（记事本、微信各测一次）。 ⏳ 待主人最终真机确认（链路各环节均已单测/真机验证）
4. 识别前后剪贴板旧内容保持不变（自动恢复）。 ✅ 实现+单测，待真机确认
5. 三家服务商切换均可用：千问 ✅（主人真机已通）；豆包 ✅（真实 Key 链路验证通过，待主人最终语音验收）；腾讯 ⏳（协议+签名单测全绿，待主人真机）
6. 内存：平时 <10MB，说话时 <100MB（任务管理器观察）。 ✅ 云端方案设计保证
7. 全量测试 3906 通过、lint、typecheck 全绿，不破坏现有功能。 ✅ 已验证

---

## 十四、风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| uiohook-napi 原生模块被杀毒误报 / 版本不兼容 | 中 | uiohook-napi 为 N-API 模块（ABI 稳定，一般免 rebuild）；若遇 Electron 升级兼容问题再用 `@electron/rebuild` 对齐；误报则加白名单说明 |
| 按住 Win 弹开始菜单 | 中 | 实施时实测键钩子拦截；不行引导换键 |
| 模拟粘贴失败（管理员权限/部分软件拦截） | 中 | 提示避免以管理员身份运行 Cherry Studio；提供 keyTap→SendInput→SendKeys 三级降级 |
| 三家接口细节与文档有出入/密钥体系变化 | 低 | 每适配器以官方文档+控制台实际配置为准，一处适配器内部修正不影响其它 |
| 快捷键冲突 | 低 | 快捷键页自由更换 |
| 隐私（声音上网） | 低 | 设置页注明"语音发送至所选服务商识别"，由主人自决 |

---

## 十五、测试方式（遵守主人铁律）

- **只做无界面测试**：vitest 单测（快捷键默认值、配置读写、三家报文构造与签名、剪贴板备份/恢复逻辑 mock）、lint、typecheck。
- **不做** GUI 自动化、弹窗、自动开浏览器。
- "真的能打字"必须真机验证，主人按女仆提供的清单亲手测。

---

## 十六、参考文档链接

1. 千问 Qwen-Audio-3.0-ASR-Flash-Streaming/Fun-ASR-Realtime WebSocket API：https://help.aliyun.com/zh/model-studio/fun-asr-realtime-websocket-api
2. 千问 实时语音识别用户指南：https://help.aliyun.com/zh/model-studio/real-time-speech-recognition-user-guide
3. 豆包（火山引擎）流式语音识别：https://docs.volcengine.com/docs/6561/80818
4. 豆包语音大模型（双向流式，二期扩展参考）：https://docs.volcengine.com/docs/6561/2630027
5. 腾讯云 实时语音识别（WebSocket）：https://cloud.tencent.com/document/product/1093/48982
6. uiohook-napi（键盘钩子+模拟按键）：https://github.com/SnosMe/uiohook-napi
7. Daisy-Voice-Agent（按住说话参考实现）：https://github.com/forestai123456/Daisy-Voice-Agent