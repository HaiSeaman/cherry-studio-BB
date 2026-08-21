# Cherry-Studio-BB v1.5.5 Release Notes

> 版本：1.5.5 · 发布日期：2026-08-21

本次版本聚焦**稳定性与安全**：修复了主题颜色切换失效的严重 BUG，并对小程序桥与 OAuth 回传做了安全加固。

## 🐛 修复

### 1. 修复「部分主题颜色无法切换」的严重 BUG
- **现象**：粉色（pink）、蓝色（sky）、黄色（butter）主题无法切换，而绿色（oasis）、灰色（slate）、深蓝（deepblue）正常。
- **根因**：CSS 选择器特异性不对称 —— 浅色变体 `[theme-id='sky']` 与深色默认 `[theme-mode='dark']` 特异性相同且后者源码靠后，主题切换瞬间 `theme-mode` 残留为 `dark` 时，浅色变体被深色规则覆盖成深灰绿。
- **修复**：
  - 全部主题选择器对称化（浅色加 `[theme-mode='light']`、深色补 `theme-id`），彻底消除层叠冲突；
  - deepblue 分支补全 11 个自包含变量，避免深蓝背景下文字不可读；
  - ThemeProvider 引入 `themeRef` 消除异步回调闭包过期导致的属性残留。

### 2. 修复高危安全漏洞：小程序桥全量 API 暴露
- 原实现允许任意本地 `file://` 页面调用**全部** `window.api`（含文件删除、系统文件读写），存在被恶意本地页面利用的风险。
- 现已改为**方法白名单 + webview 来源校验 + 消息结构校验**，仅放行只读安全方法。

### 3. 修复 OAuth 回传缺少来源校验
- SiliconFlow / AIHubMix / 302.AI / AiOnly 四个 OAuth 流程的回传消息此前未校验来源域名，存在被恶意网页注入伪造 API Key 的风险。
- 已为各流程加上官方域名校验。

## 🛡️ 安全加固
- 小程序桥（useBridge）白名单机制，杜绝任意本地页面越权调用系统 API。
- OAuth 回传严格校验 `event.origin`，仅接受对应服务商官方域名。

## 🧪 质量
- 新增 18 个单元测试（主题 5 + 小程序桥安全 9 + OAuth 4）。
- Renderer 全量测试 **164 文件 / 2817 用例全部通过**。
- TypeScript typecheck（node + web）与 ESLint 零错误。
- 隐私审查：确认无遥测/分析 SDK，日志本地存储无网络上报。

## 📦 下载
- Windows 安装包（NSIS）：`Cherry-Studio-BB-1.5.5-win-x64-setup.exe`
- Windows 便携版（Portable）：`Cherry-Studio-BB-1.5.5-win-x64-portable.exe`

## ⚠️ 已知事项
- `out/` 编译产物已随本次版本重新构建，安装即生效。
- WebDAV/S3 密钥明文存储、主窗口 `webSecurity` 配置等架构级隐私项已记录在 CHANGELOG，待后续版本评估优化。
