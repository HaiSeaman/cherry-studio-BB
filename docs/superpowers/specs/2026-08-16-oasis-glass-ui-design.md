# 「晨间绿洲 · 透明通感」UI 改造设计

日期：2026-08-16
状态：已确认（用户拍板：方案 C 混合毛玻璃 / 彻底移除深色 / 统一晨间绿洲色板 / 外壳+弹窗玻璃化内容区实色 / 主色 #10B981 / 「透明通感」风格）

## 目标

把全应用从「默认深色 + 冷白浅色」改造成统一的「晨间绿洲」浅色护眼主题 + 毛玻璃质感：
- 窗口无边框（现状已具备，Windows/Linux `frame: false` + 自绘 WindowControls）
- 背景层：Win11 透出系统 Mica；Win10 合成「假 Acrylic」（薄荷绿渐变 + 模糊 + 噪点 + 白罩）
- 玻璃层：外壳（侧边栏/顶栏/Tab 栏/弹窗/下拉）半透明白 + backdrop-filter
- 内容层：聊天区/设置表单保持近实色暖白，保证可读性
- 彻底移除深色模式

## 玻璃参数（透明通感）

| 区域 | 白透明度 | blur | 说明 |
|---|---|---|---|
| 左侧功能栏（纯图标） | 0.55 | 8px | 通感最强，图标对比度足够 |
| 顶部导航 | 0.60 | 10px | 有文字按钮，保可读 |
| Tab 栏 | 0.60 | 10px | 同上 |
| Modal / Dropdown | 0.85 | 20px | 文字密集，接近实色 |
| 聊天区 / 设置表单 | 实色暖白 | — | 护眼核心，不玻璃化 |

主色：`#10B981`（沿用音乐页 mx 色板）。

## 架构

- 背景层 `AcrylicLayer`：`position: fixed` 全窗，Win11 = 透出系统 Mica（保留现有 `backgroundMaterial: 'mica'`）；Win10 = 合成渐变 + noise，不随滚动
- 玻璃层 `GlassPanel`：`rgba(255,255,255,0.55~0.85)` + `backdrop-filter: blur(...) saturate(1.4)` + 1px 细白边 + 圆角
- 内容层：保持实色，仅换色板

## 关键技术风险与对策

1. **drag region + backdrop-filter 同元素（Windows 已知问题）**：blur 放内部背景层（`::before`/子层），拖拽元素本身只做半透明。实施前 5 分钟 spike 验证；失败则回退「全局单层 blur + 面板纯半透明」方案
2. **可读性**：玻璃只用于外壳/弹窗，内容区实色；对比度 < 4.5:1 逐项调
3. **性能**：并发 blur 层控制在 ≤3（背景层 + 面板 ≤2），聊天滚动区不叠玻璃
4. **Win10 假 Acrylic**：合成背景固定定位，不依赖 resize 事件

## 实施阶段

### Phase 1 — 色板统一 + 固定浅色（本次）
- `assets/styles/color.css`：浅色块重写为晨间绿洲色板（暖白 #F5F9F6 系 + 薄荷绿），主色 #10B981
- `context/ThemeProvider.tsx`：强制 light，移除深色分支，保留 Context API 兼容调用点
- `context/AntdProvider.tsx`：固定 defaultAlgorithm + 晨间绿洲 token
- `components/app/Sidebar.tsx`：删除主题切换按钮
- `main/services/WindowService.ts`：背景色/titleBarOverlay/darkTheme 固定浅色
- 硬编码深色清理（本轮扫 `#181818`/`#1f1f1f` 等）

### Phase 2 — 毛玻璃化（下一轮）
- 新建 `components/Glass/`：`AcrylicLayer.tsx`、`GlassPanel.tsx`
- Sidebar / Navbar / TabContainer / QuickPanel / antd Modal·Dropdown·Popover token 玻璃化
- `--color-background-opacity` 改为半透明白

### Phase 3 — 深色清理收尾
- main process 剩余 nativeTheme 引用、设置页深色 UI、mx.tsx 双份收敛为唯一来源

### Phase 4 — 验收
- 逐页截图 + 打包 exe

## 验收标准

- 全应用仅浅色，无深色入口
- 窗口背景 Win10 显示晨雾渐变，Win11 显示 Mica
- 外壳毛玻璃、内容区可读
- 功能零回归（纯视觉改动）
