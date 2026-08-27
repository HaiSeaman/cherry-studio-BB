# 打卡功能（Habit Tracker）设计文档

日期：2026-08-28（v2 修订）
状态：待用户审阅

> 修订说明：v2 修正了 v8 版本号错误（实际应为 v13）、deprecated 描述错误；
> 根据用户决策锁定：第一版仅每日打卡（数据模型预留频率字段）、二元打卡（预留次数字段）、
> 支持 Skip 跳过、无限补卡；强度指数改用业界验证过的 EMA 公式。

## 1. 背景与目标

在 Cherry Studio（fork: cherry-studio-BB）中新增一个「打卡」TAB 页，用于长期（一年、两年乃至更久）记录个人习惯/项目打卡，如戒烟、喝水、运动、早睡等。

核心诉求：
- 新增独立侧边栏入口（TAB 页）
- **B 风格主界面**：每项目一行，日历格子从左到右横向展开（整月），项目从上到下依次排列；颜色区分打卡状态，哪天打卡一目了然
- 丰富的统计 UI（完成率趋势、习惯对比、年度热力图、单习惯详情）
- 数据本地持久化 + 复用项目现有 WebDAV/S3 云同步
- 记录长期不丢、可补卡、可自定义习惯细节

已锁定的产品决策（用户拍板）：
| 决策点 | 结论 |
|---|---|
| 习惯频率 | 第一版仅「每日打卡」；数据表预留 frequency 字段，未来支持每周 N 次/指定星期几时只加 UI 不改表 |
| 打卡类型 | 二元打卡（打了/没打）；记录表预留 count 字段供未来「喝水 8 杯」类次数打卡 |
| 跳过机制 | 支持 Skip：某天标记跳过（出差/生病），不断卡、不扣分 |
| 补卡限制 | 无限补卡：任意过去日期都可补卡/撤卡（自己记录自己看，不做防作弊） |

## 2. 技术方案总览

| 项 | 方案 |
|---|---|
| 数据层 | Dexie (IndexedDB)，库 `CherryStudio`，新增 2 张表，随 **v13** 版本升级（⚠️ v8~v12 已被占用：v11 音乐、v12 便签） |
| 路由 | `Router.tsx` 懒加载注册 `/habits` |
| 侧边栏 | `SidebarIcon` 增加 `'habits'`，iconMap/pathMap 增加映射，图标可拖拽排序（复用现有 `sidebarIcons` 机制；老用户已持久化设置里没有 habits，需在 Sidebar 渲染兜底或默认 visible 列表处理） |
| UI | 复用项目现有技术：React + antd + styled-components；日历格子自研（现成库均为全年聚合形态，不匹配 B 风格） |
| 云同步 | **零额外开发**：现有 `BackupManager`（`src/main/services/BackupManager.ts`）直接拷贝 IndexedDB 目录，新表自动包含在 WebDAV/S3/本地备份中。限制见第 7 节 |
| 状态管理 | **定死：`useLiveQuery`（dexie-react-hooks）直连 Dexie**，数据一变视图自动刷新，与 notes 页面（NotesPage.tsx）模式完全一致；不引入 Redux slice |

## 3. 数据模型

### 3.1 习惯定义表 `habits`

```ts
interface Habit {
  id: string              // uuid
  name: string            // 习惯名称，如"戒烟"
  icon: string            // emoji 图标，用于列表/详情
  color: string           // 主题色（色板中选，如 #D85A30）
  order: number           // 排序权重（从上到下排列）
  archived: boolean       // 归档（隐藏但不删除数据）
  createdAt: number       // 创建时间戳（统计口径的起点）
  // ---- 以下为预留字段：v1 固定 daily，UI 不暴露，未来支持频率时只改 UI ----
  frequencyType: 'daily' | 'timesPerWeek' | 'daysOfWeek'  // v1 恒为 'daily'
  timesPerWeek?: number   // frequencyType='timesPerWeek' 时使用（如 3）
  daysOfWeek?: number[]   // frequencyType='daysOfWeek' 时使用（0=周日…6=周六，如 [1,3,5]）
}
```

### 3.2 打卡记录表 `habit_records`

```ts
interface HabitRecord {
  habitId: string
  date: string            // 'YYYY-MM-DD'，本地时区
  status: 'done' | 'skip' // done=已打卡；skip=跳过（不断卡不扣分）
  // ---- 预留：v1 不写入 ----
  count?: number          // 未来次数打卡（喝水 8 杯）用
  createdAt: number       // 记录写入时间（区分当天打的还是后来补的）
}
// Dexie schema：'[habitId+date], date'（复合主键 + date 索引供热力图按日查询）
// 不存在该行 = 当天未处理；删除该行 = 撤销打卡/撤销跳过
```

数据量估算：10 个习惯 × 365 天 × 10 年 = 3.65 万条记录，IndexedDB 完全无压力。

### 3.3 Dexie 升级（v13）

- `databases/index.ts` 新增 `db.version(13)`，**照抄 v12 的模式**：把 v12 全部表原样重抄一遍 + 追加 `habits: 'id, order, archived'`、`habit_records: '[habitId+date], date'`
- `databases/upgrades.ts` 新增 `upgradeToV13`（v13 只是建新表，无存量数据迁移，升级函数为空实现即可）
- ⚠️ 该文件头部有上游 v2 重构的 `@deprecated`/BLOCKED 标记；本 fork 已有先例（v11 音乐、v12 便签均直接在此加表），继续沿用，但**改动严格限于追加版本声明与类型**，不动存量版本
- EntityTable 类型声明加在文件底部的 `as Dexie & {...}` 类型断言中（同 music/hub 表位置）

## 4. UI 设计

### 4.1 页面结构

```
打卡页 /habits
├── 顶部导航：打卡（月历）/ 统计 / 习惯管理 三个子视图切换 +「+ 添加习惯」按钮
├── 统计卡条（4 个）：
│   累计打卡天数 · 今日进度 X/Y · 近30天完成率 · 最佳连续天数
├── 主视图「月历」（B 风格）：
│   ├── 月份标题 + 左右翻月（回到今天按钮）
│   ├── 日期标题行（1~31，今天的列号高亮）
│   └── 每习惯一行：
│       左侧：色块 + 名称（点击进入单习惯详情）
│       中间：整月格子（从左到右展开）
│       右侧：当前连续 / 最长连续
└── 统计视图（4 模块）：
    ├── 每日完成率趋势折线图（30/90/全年切换）
    ├── 各习惯完成率横向条形图（按强度指数排序）
    ├── 年度热力图（GitHub 风格，颜色深浅=当天完成习惯数）
    └── 单习惯详情（点击习惯行进入）：
        当前连续 · 最长连续 · 总打卡 · 强度指数 + 星期分布柱状图
```

### 4.2 格子颜色规则（一目了然）

| 状态 | 样式 |
|---|---|
| 已打卡（done） | 习惯色浅色格（如戒烟 #F5C4B3） |
| 跳过（skip） | 灰色格 + 「-」符号（明确区分于漏卡） |
| 今天（已打） | 习惯色深色实心 + 深色描边 |
| 今天（未打） | 习惯色深色虚线描边（提示该打） |
| 漏卡（过去未打卡且未跳过） | 空白 + 红色虚线边框 |
| 未到（未来） | 空白 |

每个习惯一个主题色，多习惯视觉上互不混淆。

### 4.3 交互

- **左键点格子**：打卡 ⇄ 取消（过去日期即补卡/撤卡，无限补卡）
- **右键点格子**（或长按）：菜单 → 标记跳过 / 取消跳过
- **误触保护**：取消打卡时弹 antd message toast，附「撤销」按钮，5 秒内一键恢复（防手抖毁掉连续记录）
- 点击习惯名称：进入单习惯详情
- 添加/编辑习惯：名称 + emoji 图标 + 色板选色；删除走归档（保留历史数据），习惯管理子视图提供「已归档」列表：恢复 / 彻底删除（彻底删除需二次确认，连带删除该习惯全部记录）
- 窄窗口适配：格子设最小宽度（约 22px），不足时整行横向滚动（左侧习惯名固定不滚）；不做格子自动缩成色点以下的尺寸

### 4.4 统计口径（实现规则，含 Skip 处理）

以下口径均「跳过日不算应打卡日」：

- **当前连续**：从今天往前数连续 done 天数；**今天还没打不算断**——若今天无记录，则从昨天往前数（今天还没过完，不能判死刑）。skip 日跳过不算断，继续往前数
- **最长连续**：历史最长连续 done 段（skip 同上不断）
- **完成率**：done 天数 ÷（创建之日起至今天的天数 − skip 天数）
- **强度指数（EMA 公式，参考 Loop Habit Tracker 公开算法思想，自行实现）**：
  ```
  S(今天) = S(昨天) × m + X(今天) × (1 − m)
  m = 0.5^(1/13) ≈ 0.9487   // 半衰期 13 天
  X = 1（done）/ 0（漏卡）
  skip 日：S 不更新（保持前一天值）
  ```
  - 从习惯创建日起逐日迭代到今天，展示为 0~100
  - 特性：偶尔断两三天不清零、越久远的打卡影响越小、每日习惯坚持 2 个月约到 96 分
  - 未来支持非每日频率时，将 m 改为 `0.5^(√f/13)`（f=目标频率，每日=1.0），当前 v1 直接用常数
  - ⚠️ 许可证注意：EMA 是公开数学概念，可自由实现；但 Loop 是 GPLv3 开源，**不得复制其源码**
- **星期分布**：按周几统计 done 率（分母不含 skip），发现薄弱日
- **今日进度 X/Y**：Y = 未归档习惯数（今日应打），X = 今天已 done 数

### 4.5 跨午夜自刷新

「今天」高亮与统计卡在跨午夜后自动前移：HabitsPage 挂一个分钟级 `setInterval` 检查日期字符串变化，变化时触发重渲染（数据本身由 useLiveQuery 驱动，无需额外处理）。

## 5. 文件改动清单

```
src/renderer/src/types/index.ts                     // SidebarIcon + 'habits'
src/renderer/src/i18n/label.ts                      // 侧边栏图标 label（P2 即做）
src/renderer/src/components/app/Sidebar.tsx         // iconMap/pathMap 加 habits + 老设置兜底
src/renderer/src/Router.tsx                         // /habits 懒加载路由
src/renderer/src/databases/index.ts                 // v13 声明 habits / habit_records 表
src/renderer/src/databases/upgrades.ts              // upgradeToV13（空实现，仅建表）
src/renderer/src/pages/habits/                      // 新页面模块（照 notes 模式）
  ├── HabitsPage.tsx                                // 主页面：视图切换 + 统计卡条 + 跨午夜刷新
  ├── types.ts                                      // Habit / HabitRecord / 工具类型
  ├── services/                                     // 纯函数，便于单元测试
  │   ├── habitService.ts                           // Dexie 增删改查（toggle/skip/归档）
  │   ├── stats.ts                                  // streak/完成率/EMA 强度指数
  │   └── calendar.ts                               // 月历日期工具
  ├── hooks/                                        // useLiveQuery 封装（非 Redux）
  ├── components/
  │   ├── MonthCalendar.tsx                         // B 风格项目行日历（核心组件）
  │   ├── StatsCards.tsx                            // 顶部 4 统计卡
  │   ├── StatsView.tsx                             // 统计视图（趋势图/对比条/热力图）
  │   ├── HabitDetail.tsx                           // 单习惯详情
  │   └── HabitForm.tsx                             // 添加/编辑习惯弹窗
  └── __tests__/                                    // stats.ts 口径测试（streak/skip/EMA）
```

## 6. 开发计划（阶段划分）

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **P1 数据层** | Dexie v13 建表 + 类型 + 升级逻辑 + service 层 + stats 口径单测 | `npm run typecheck` 通过；streak/skip/EMA 单测与手算一致 |
| **P2 入口接入** | 路由 + 侧边栏图标 + **i18n label** + 空页面 | 侧边栏出现打卡图标，点击进入空页面 |
| **P3 主界面（核心）** | B 风格月历 + 打卡/补卡/跳过 + 撤销 toast + 翻月 + 统计卡条 | 能建习惯、点格子打卡/跳过/撤销、翻月查看 |
| **P4 习惯管理** | 添加/编辑/归档弹窗，emoji + 色板 + 归档列表（恢复/彻底删除） | 习惯可增删改，颜色生效，归档数据不丢 |
| **P5 统计模块** | 趋势折线图 + 完成率对比条 + 年度热力图 + 单习惯详情 | 统计数字与手工核对一致 |
| **P6 打磨** | 空状态、暗色主题适配、窄窗口横向滚动、跨午夜刷新、**JSON 导出/导入**、星期分布 | 与项目主题一致，无样式错乱；导出文件可再导入还原 |

每阶段独立可验证，P3 完成后即可日常使用。JSON 导出/导入列入 P6 正式范围（数据是长期资产，多一条不依赖整库备份的迁移通道）。

## 7. 风险与注意事项

- **上游 v2 重构期**：`databases/index.ts` 带上游 `@deprecated`/BLOCKED 标记；本 fork 已有 v11/v12 先例，继续追加但严格限追加式改动，不做无关重构
- **云同步的真实限制（必须知晓）**：现有备份是**整库快照**——恢复备份会把包括打卡在内的全部数据回到备份时刻；**多台设备各自打卡后互相恢复会丢数据（后恢复的覆盖先恢复的），不支持增量合并**。建议单设备使用，或恢复前先 JSON 导出一份打卡数据
- 日历格子渲染性能：单月 31 格 × N 习惯，量级小，无需虚拟化；热力图按 date 索引查询
- 时区：打卡日期以本地时区 `YYYY-MM-DD` 为准（与便签 hub_day_notes 口径一致）
- 统计口径的 Skip 一致性：所有「应打卡日」分母必须排除 skip，streak/完成率/EMA 三处口径一致，由 stats.ts 单一出口实现（禁止各组件自己算一遍）
