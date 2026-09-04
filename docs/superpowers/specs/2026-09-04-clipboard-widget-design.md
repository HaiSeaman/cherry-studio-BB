# 剪贴板挂件 · 设计文档

日期：2026-09-04
状态：待用户确认
路径：Architectural（新子系统，但大量复用桌面挂件现有架构）

## 1. 背景与目标

在 BB 软件（Cherry Studio fork）的"桌面助手"挂件中新增一个**剪贴板历史视图**：

- 无 TAB 页、无详情页；点击顶栏小图标与本地音乐等视图切换（剪贴板排在"本地音乐"左边）
- 共用桌面助手快捷键（`desktop_widget`）呼出/隐藏
- 轻量化：不新增进程，共用挂件窗口，总增量个位数 MB
- 具备主流剪贴板功能：历史记录（文本/图片/文件路径）、搜索、条目固定、单条删除、清空、去重、点击复制
- 窗口控制：置顶、固定（锁定）、最小化、最大化、关闭
- 可拖边框调整大小，跟随软件主题配色

用户已确认的三个决策：
1. 窗口方案 = 复用桌面助手挂件窗口（不新建独立窗口）
2. 点击条目 = 只复制，不自动粘贴（用户手动 Ctrl+V）
3. 记录范围 = 文本 + 图片 + 文件路径（不做敏感内容过滤，v1 明确不做）

## 2. 已验证的现状依据（实现全部建立在已读代码之上）

| # | 验证点 | 证据 | 结论 |
|---|--------|------|------|
| 1 | 挂件已是多视图架构 | `MusicWidgetApp.tsx:23` `type View = 'local' \| 'fm' \| 'notes' \| 'todos'`；`VIEWS` 数组自动渲染顶栏切换按钮（162-170 行） | 新增视图 = 联合类型加 `'clipboard'` + 数组插入 + VIEW_META 加一条 |
| 2 | 每视图独立尺寸记忆 | `switchView` 按 `musicWidgetViewSize:${v}` 读写尺寸并 `setSize`（117-124 行）；手动拖拽防抖回存（127-148 行） | 剪贴板视图的默认尺寸与拖拽记忆**零开发自动生效** |
| 3 | 顶栏已有四键 | 置顶（setPin）、锁定（setLock）、打开主程序、"最小化"（= toggle 隐藏，快捷键呼回，194-197 行）、关闭（150-153 行） | 只需新增"最大化"按钮 |
| 4 | 视图切换持久化 | `localStorage` `musicWidgetView`（25 行） | 重开挂件自动回到上次视图 |
| 5 | 窗口控制器能力 | `WidgetWindowController`：懒创建/位置记忆/置顶/锁定/setSize/destroy；窗口参数 `minimizable:false, maximizable:false`（WindowService.ts:122-123） | 最大化需改 `maximizable:true` + 补按钮 |
| 6 | 主题跟随链路已修好 | `themeTokens` 直推挂件 + 主进程缓存 + 启动拉取（2026-09-03 修复） | 剪贴板视图同窗口，**主题跟随零开发** |
| 7 | Electron 版本 | `package.json` electron 41.2.1 | `clipboard.readBuffer('FileNameW')`（Windows 读复制文件列表）可用 |
| 8 | 快捷键 | `ShortcutService.ts` case `desktop_widget` → `toggleMusicWidget()` | 无需改动 |
| 9 | 文件路径 | `userData` 目录可写，挂件 stateFile 模式已在用 | 历史数据与缩略图存 `userData/clipboard/` |

## 3. 架构设计

### 3.1 组件划分（各一个职责）

```
┌─ 主进程 ─────────────────────────────┐
│ ClipboardService（新文件 src/main/services/ClipboardService.ts）
│  - start()/stop()：500ms 轮询 clipboard
│  - 判重（cheap→full 两级）→ 入库 → 持久化 → 广播变更
│  - 历史所有权：内存数组 + 磁盘 JSON + 缩略图 PNG
└──────────────────────────────────────┘
          ↕ IPC（Clipboard_* 通道，见 §5）
┌─ 挂件窗口（musicWidget.html，复用）──┐
│ MusicWidgetApp：VIEWS 加 'clipboard'（插在 'local' 左边）
│ ClipboardView（新组件）：纯展示层，无本地状态持久化
└──────────────────────────────────────┘
```

设计原则：**数据所有权只在主进程**。挂件端不存历史（挂件 destroy 即释放，数据无损，与挂件现有设计约束一致）；挂件打开剪贴板视图时拉取一次，之后接收增量推送。

### 3.2 主进程 ClipboardService

- **监听**：`setInterval` 500ms（Electron 无剪贴板变更事件，轮询是标准做法；每次只读 `availableFormats()`，几乎零开销）
- **两级判重**：
  - cheap：与最近一条比较（文本比字符串、图片比尺寸+格式、文件比内容串）→ 不同才进入 full
  - full：计算内容指纹（文本直接全文；图片 `toPNG()` 后取长度+尾部采样 hash），与最近 200 条指纹比对 → 命中则该条提升置顶并刷新时间
- **入库**：
  - 文本：截断至 5000 字符（同 §4 数据模型），存磁盘 JSON
  - 图片：`nativeImage.resize` 至宽 240px 缩略图 → `userData/clipboard/thumbs/<id>.png`；不保留原图（预览够用，v1 明确取舍）
  - 文件：`clipboard.readBuffer('FileNameW')` 解析 Windows 宽字符文件路径（标准 CF_HDROP 格式）
- **淘汰**：上限 200 条（固定常量，`ponytail:` 注释标注"需要可调时接 settings store"）；**固定条目永不淘汰**；淘汰时同步删除对应缩略图文件
- **持久化**：每次变更防抖 800ms 写 `userData/clipboard/history.json`（200 条 JSON < 2MB，启动时全量读入内存）
- **生命周期**：`app ready` 即 `start()`，`will-quit` 清理定时器；**不管挂件窗口开没开都记录**

### 3.3 挂件端 ClipboardView

- 打开剪贴板视图时 `invoke` 拉取全量列表；订阅 `Clipboard_OnUpdate` 接收增量（新条目/删除/固定状态变化 → 全列表替换，200 条以内无性能问题）
- 顶栏切换、尺寸记忆、置顶/锁定按钮：**全部复用现有机制，零开发**
- 空状态：居中提示"按 Ctrl+C 复制内容后自动出现在这里"

## 4. 数据模型

```ts
type ClipboardItem = {
  id: string            // nanoid
  type: 'text' | 'image' | 'files'
  ts: number            // 最后复制时间（去重命中时刷新）
  pinned: boolean       // 条目固定
  // text
  text?: string         // 完整文本（截断至 5000 字符保护）
  // image
  thumbPath?: string    // 绝对路径 userData/clipboard/thumbs/<id>.png
  imageW?: number       // 原图尺寸（展示用）
  imageH?: number
  // files
  paths?: string[]      // 文件绝对路径列表
  fingerprint: string   // full 判重指纹
}
```

## 5. IPC 通道（全部新增到 `packages/shared/IpcChannel.ts`）

| 通道 | 方向 | 语义 |
|---|---|---|
| `Clipboard_GetHistory` | 挂件→主（invoke） | 拉取全量（pinned 优先，组内按 ts 降序） |
| `Clipboard_OnUpdate` | 主→挂件（send） | 变更后推全量列表（200 条 JSON 约 100KB，简单可靠） |
| `Clipboard_CopyItem` | 挂件→主（invoke） | 把条目写回系统剪贴板 |
| `Clipboard_SetPinned` | 挂件→主（invoke） | 固定/取消固定 |
| `Clipboard_DeleteItem` | 挂件→主（invoke） | 删除单条（含缩略图文件） |
| `Clipboard_ClearAll` | 挂件→主（invoke） | 清空未固定条目（固定条目保留，按钮文案注明） |

preload 新增 `window.api.clipboard` 命名空间。

## 6. UI 设计（挂件内，无 TAB 无详情页）

```
┌─────────────────────────────────────────────┐
│ 📋 🔁 🎵 📻 📝 ☑   桌面助手   📌 🔒 ⛶ ─ ✕ │ ← 顶栏（clipboard 图标在 local 左边）
├─────────────────────────────────────────────┤
│ 🔍 搜索历史……                                │
│ 📌 固定（若有）                               │
│ ┌─────────────────────────────────┐         │
│ │ T 预览文本（最多 3 行截断） 📌 🗑 │         │
│ │ 🖼 [缩略图，等比适配]        📌 🗑 │        │
│ │ 📄 文件名.docx（2 个文件）   📌 🗑 │       │
│ └─────────────────────────────────┘         │
│ …                                           │
├─────────────────────────────────────────────┤
│ 47 条 · 图片 3 · 文件 2        [清空未固定]   │
└─────────────────────────────────────────────┘
```

- 每条：类型图标 + 预览 + 悬停浮现固定/删除小按钮（平时隐藏，保持轻量）
- 点击条目：`Clipboard_CopyItem` → 顶栏下方短暂浮现"已复制"提示（1.2s 自动消失）
- 列表虚拟化：200 条上限内普通列表 + 溢出滚动即可，不上虚拟滚动（YAGNI）
- 样式全部用挂件现有 CSS 变量（`--accent/--bg/--text/--border` 等），主题跟随自动生效
- 顶栏"最大化"按钮（新）：`maximize()/unmaximize()` 切换，图标随状态切换

## 7. 行为规则与边界处理

1. **去重**：full 指纹命中 → 提升到固定区之下/列表顶部，刷新 ts，不重复占位
2. **排序**：固定区在前（按固定时间倒序），历史区按 ts 倒序
3. **最大化与视图切换冲突**：处于最大化时点击任何视图切换按钮 → 先 `unmaximize()` 再按视图记忆尺寸 setSize（在主进程 setSize 内统一处理：`if (win.isMaximized()) win.unmaximize()`）
4. **最大化实现**：窗口参数改 `maximizable: true`（Windows 无边框窗口 maximize 自动铺满工作区、不含任务栏；unmaximize 自动还原原位置尺寸，无需手动记忆）
5. **最小化语义**：顶栏"─"沿用现有 toggle（隐藏窗口，快捷键呼回），不改——与挂件"不在任务栏"设定一致
6. ** FileNameW 兼容**：读不到/解析失败时降级：该次复制按普通处理（若有文本格式则记文本，否则跳过并 debug 日志）
7. **图片轮询开销**：cheap 级先比 `getSize()`+格式，不命中才 `toPNG()`；连续截图等大图场景轮询成本可控
8. **多显示器**：位置记忆沿用 windowStateKeeper 现有逻辑，不新增处理
9. **挂件未开时**：主进程照常记录；挂件打开剪贴板视图时全量拉取即可看到完整历史
10. **磁盘失败兜底**：JSON 写失败仅告警日志，内存历史继续可用；缩略图写失败该条降级为占位图标

## 8. 资源预算（最终）

| 项目 | 占用 |
|---|---|
| 新增进程 | 0 |
| ClipboardView 界面（挂件内视图切换，非活动视图保持卸载） | 约 2~5 MB |
| 主进程监听 + 历史（200 条内存驻留） | < 2 MB，CPU < 0.1% |
| 磁盘 | history.json < 2MB + 缩略图 200×20KB ≈ 4MB |
| 相比独立窗口方案节省 | 约 60~100 MB |

## 9. 明确不做（v1 范围外）

- 自动粘贴到原应用（用户已选手动 Ctrl+V）
- 敏感内容过滤（用户未选）
- 原图保存 / 图片搜索 / OCR
- 历史上限可配置（固定 200，留 `ponytail:` 升级点）
- 专属"呼出并切到剪贴板"的第二个快捷键（顶栏点击已够用，需要时二期加）

## 10. 施工步骤（每步带验证点）

1. **主进程 ClipboardService**：数据模型 + 轮询监听 + 判重 + 存储 + 单元测试（service 纯逻辑部分抽可测函数：判重/淘汰/排序）
   - 验证：`vitest` 新增 `ClipboardService.test.ts` 覆盖判重/去重提升/淘汰/固定保护
2. **IPC + preload**：6 个通道 + `window.api.clipboard`
   - 验证：typecheck 通过；主进程 handler 手动冒烟（dev 运行复制文本 → history.json 落盘）
3. **挂件端 ClipboardView + 视图接入**：VIEWS 插入 `'clipboard'`（local 左边）+ VIEW_META + 列表/搜索/固定/删除/清空/已复制提示
   - 验证：dev 运行切换视图、复制文本/图片/文件三类内容各验证一遍；搜索过滤；主题切换跟随（含米白/白灰新主题）
4. **最大化按钮**：窗口参数 + 顶栏按钮 + 最大化期间切视图的 unmaximize 规则
   - 验证：最大化→还原→位置尺寸不丢；最大化状态下切换视图不残留
5. **整体审查**：typecheck + 全量构建 + 全量测试 + eslint 改动文件 + diff 审查

## 11. 风险清单

| 风险 | 等级 | 对策 |
|---|---|---|
| FileNameW 解析对特殊文件名/网络路径不健壮 | 中 | 降级策略（§7.6），实现阶段用中文路径/网络路径实测 |
| 500ms 轮询与其他剪贴板管理工具（如 Ditto）抢占 | 低 | 只读不写，不改剪贴板内容；无冲突 |
| 最大化后 windowStateKeeper 尺寸记忆被污染 | 低 | unmaximize 先还原再 setSize（§7.3），实测验证 |
| 大图复制瞬间 toPNG 卡顿 | 低 | cheap 预判 + 只在新内容时执行；实测 >8K 截图场景 |
