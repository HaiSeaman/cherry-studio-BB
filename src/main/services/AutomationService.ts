import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { loggerService } from '@logger'
import { isWin } from '@main/constant'
import { validatePath } from '@main/mcpServers/filesystem/types'
import { writeWithLock } from '@main/utils/file'
import type {
  AutomationRun,
  AutomationRunStatus,
  AutomationRunStep,
  AutomationSysFileListResult,
  AutomationSysFileResult,
  AutomationSysPowerResult,
  AutomationTask
} from '@shared/automation'
import { weekdayToJsDay } from '@shared/automation'
import { IpcChannel } from '@shared/IpcChannel'
import { app } from 'electron'

import { windowService } from './WindowService'

const logger = loggerService.withContext('AutomationService')

/** 补触发窗口（毫秒）：系统休眠/调度延迟时仍可补跑（与闹钟一致） */
const FIRE_WINDOW_MS = 90_000
/** 调度检查间隔 */
const TICK_MS = 30_000
/** 运行历史保留条数 */
const MAX_RUNS = 200
/** 单次运行看门狗超时（毫秒），与渲染进程侧超时一致 */
const RUN_TIMEOUT_MS = 10 * 60_000
/** 全局最大并行运行数 */
const MAX_CONCURRENT_RUNS = 2

/** C1：拒绝写入的危险可执行/脚本扩展名（防持久化 RCE） */
const BLOCKED_WRITE_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.pif',
  '.msi',
  '.msp',
  '.ps1',
  '.psm1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.hta',
  '.cpl',
  '.dll',
  '.sys',
  '.lnk',
  '.reg'
])

/** daily/once 时间解析：HH:mm → 当天秒数 */
function parseDailyTime(time: string): number | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 3600 + min * 60
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 旧数据归一化：weekly 单选 weekday → weekdays 数组（幂等，加载时调用） */
export function normalizeTaskSchedules(tasks: AutomationTask[]): void {
  for (const task of tasks) {
    const s = task.schedule as { type?: string; weekday?: number; weekdays?: number[]; time?: string } | undefined
    if (s?.type === 'weekly' && !Array.isArray(s.weekdays)) {
      task.schedule = {
        type: 'weekly',
        weekdays: typeof s.weekday === 'number' ? [s.weekday] : [],
        time: s.time ?? '00:00'
      }
    }
  }
}

interface StoreData {
  tasks: AutomationTask[]
  runs: AutomationRun[]
  /** C1：已授权的根目录（由任务中用户选择的 workDir/linkedFiles 派生并持久化） */
  authorizedRoots?: string[]
}

interface FinishRunPayload {
  status: 'success' | 'failed' | 'timeout'
  output?: string
  error?: string
}

export class AutomationService {
  private data: StoreData = { tasks: [], runs: [] }
  private storePath = ''
  private timer: ReturnType<typeof setInterval> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  /** 运行看门狗：runId → timer */
  private watchdogs = new Map<string, ReturnType<typeof setTimeout>>()
  private initialized = false

  public async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    this.storePath = path.join(app.getPath('userData'), 'automation.json')
    await this.load()
    // 启动时先补记一次错过的任务，再开调度
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    logger.info('AutomationService initialized', { tasks: this.data.tasks.length })
  }

  private async load(): Promise<void> {
    let raw: string
    try {
      raw = await fsp.readFile(this.storePath, 'utf8')
    } catch (error) {
      // 首次运行时文件尚不存在属正常情况；其它读取错误（权限/磁盘）需要留痕
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to read automation store', error as Error)
      }
      this.data = { tasks: [], runs: [], authorizedRoots: [] }
      return
    }

    try {
      const parsed = JSON.parse(raw) as StoreData
      this.data = {
        tasks: parsed.tasks ?? [],
        runs: parsed.runs ?? [],
        authorizedRoots: parsed.authorizedRoots ?? []
      }
      normalizeTaskSchedules(this.data.tasks)
      // 崩溃残留的 running 记录：标记为 failed
      for (const run of this.data.runs) {
        if (run.status === 'running') {
          run.status = 'failed'
          run.finishedAt = Date.now()
          run.error = '应用重启导致运行中断'
        }
      }
    } catch (error) {
      // 解析失败时**不再静默清空**：先备份损坏文件再以空数据继续运行。
      // 否则紧随其后的 save() 会把原文件直接覆盖，用户的任务/授权目录将永久丢失。
      const backupPath = `${this.storePath}.bak`
      try {
        await fsp.copyFile(this.storePath, backupPath)
        logger.warn('Automation store 解析失败，已备份损坏文件后以空数据启动', {
          backupPath
        })
      } catch (backupError) {
        logger.error('Failed to back up corrupt automation store', backupError as Error)
      }
      logger.error('Failed to parse automation store', error as Error)
      this.data = { tasks: [], runs: [], authorizedRoots: [] }
    }
  }

  /** 防抖写盘（原子写：先写 .tmp 再 rename，避免中断/断电留下半截 JSON） */
  private save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      writeWithLock(this.storePath, JSON.stringify(this.data, null, 2), { atomic: true, encoding: 'utf8' }).catch((e) =>
        logger.error('Failed to persist automation store', e as Error)
      )
    }, 500)
  }

  private notifyChanged(): void {
    windowService.getMainWindow()?.webContents.send(IpcChannel.Automation_TasksChanged)
  }

  // ———————————————— 调度 ————————————————

  private tick(): void {
    const now = new Date()
    const nowMs = now.getTime()
    let activeRuns = this.data.runs.filter((r) => r.status === 'running').length
    let changed = false

    for (const task of this.data.tasks) {
      if (!task.enabled) continue
      const outcome = this.evaluateSchedule(task, now, nowMs)
      if (outcome === 'none') continue
      if (outcome === 'missed') {
        // 错过即跳过：记一条 skipped，不再补跑
        this.appendRun(this.makeRun(task, 'skipped', { note: '触发时刻已过（软件未运行），按设置跳过' }))
        if (task.schedule.type === 'once') task.enabled = false
        task.lastTriggerKey = dateKey(now)
        changed = true
        continue
      }
      // outcome === 'due'
      if (activeRuns >= MAX_CONCURRENT_RUNS) {
        // 并发已满：不标记触发，下一跳重试（窗口内会补上）
        logger.info('Automation concurrency full, deferring task', { taskId: task.id })
        continue
      }
      if (this.triggerRun(task, nowMs)) {
        activeRuns += 1
      }
      changed = true
    }
    if (changed) {
      this.save()
      this.notifyChanged()
    }
  }

  /** 判定任务当前状态：due（到期）/ missed（错过）/ none */
  private evaluateSchedule(task: AutomationTask, now: Date, nowMs: number): 'due' | 'missed' | 'none' {
    const schedule = task.schedule

    if (schedule.type === 'once') {
      if (task.lastRunAt) return 'none' // 一次性任务已运行过
      if (nowMs < schedule.at) return 'none'
      return nowMs - schedule.at <= FIRE_WINDOW_MS ? 'due' : 'missed'
    }

    if (schedule.type === 'interval') {
      const base = task.lastRunAt ?? task.createdAt
      const next = base + schedule.everyMinutes * 60_000
      if (nowMs < next) return 'none'
      // 落后多个周期也只跑一次（catch-up single）
      return 'due'
    }

    // daily / weekly：同一时间窗口判定，weekly 额外要求星期匹配（多选任一命中即可）
    if (schedule.type === 'daily' || schedule.type === 'weekly') {
      if (schedule.type === 'weekly' && !schedule.weekdays.some((w) => weekdayToJsDay(w) === now.getDay())) {
        return 'none'
      }
      const sec = parseDailyTime(schedule.time)
      if (sec === null) return 'none'
      const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
      const todayKey = dateKey(now)
      if (task.lastTriggerKey === todayKey) return 'none' // 今天已触发或已记跳过
      if (nowSec >= sec && nowSec - sec <= FIRE_WINDOW_MS / 1000) return 'due'
      if (nowSec > sec) return 'missed' // 窗口已完全过去且今天未触发
      return 'none'
    }

    return 'none'
  }

  private makeRun(
    task: AutomationTask,
    status: AutomationRunStatus,
    extra?: { note?: string; error?: string }
  ): AutomationRun {
    return {
      id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      taskId: task.id,
      taskName: task.name,
      status,
      startedAt: Date.now(),
      finishedAt: status === 'running' ? undefined : Date.now(),
      steps: [],
      ...(extra?.note ? { note: extra.note } : {}),
      ...(extra?.error ? { error: extra.error } : {})
    }
  }

  private appendRun(run: AutomationRun): void {
    this.data.runs.unshift(run)
    if (this.data.runs.length > MAX_RUNS) {
      this.data.runs.length = MAX_RUNS
    }
  }

  /**
   * 触发任务执行：建 run 记录并通知渲染进程（manual=手动「立即运行」，不消耗调度状态）。
   * 返回是否成功进入 running（窗口不可用时立即失败并返回 false，不占并发名额）。
   */
  private triggerRun(task: AutomationTask, nowMs: number, manual = false): boolean {
    // 先确认主窗口可用再改调度状态：否则任务会因「窗口不可用」被永久消耗
    // （once 置 enabled=false / daily weekly 记 lastTriggerKey / interval 重置 lastRunAt）
    const win = windowService.getMainWindow()
    if (!win || win.isDestroyed()) {
      logger.warn('Automation run skipped: main window unavailable', { taskId: task.id })
      return false
    }

    const run = this.makeRun(task, 'running')
    this.appendRun(run)
    if (manual) {
      // 手动运行不改调度状态：一次性任务不被消耗、间隔节拍不被重置
      logger.info('Automation task manually triggered', { taskId: task.id, runId: run.id })
    } else {
      task.lastRunAt = nowMs
      if (task.schedule.type === 'once') task.enabled = false
      if (task.schedule.type === 'daily' || task.schedule.type === 'weekly') {
        task.lastTriggerKey = dateKey(new Date(nowMs))
      }
    }

    // 看门狗：渲染进程超时未回报则强制收尾
    const watchdog = setTimeout(() => {
      this.watchdogs.delete(run.id)
      const r = this.data.runs.find((x) => x.id === run.id)
      if (r && r.status === 'running') {
        r.status = 'timeout'
        r.finishedAt = Date.now()
        r.error = '运行超时（10 分钟）'
        this.save()
        this.notifyChanged()
        logger.warn('Automation run watchdog timeout', { runId: run.id, taskId: task.id })
      }
    }, RUN_TIMEOUT_MS)
    this.watchdogs.set(run.id, watchdog)

    win.webContents.send(IpcChannel.Automation_TriggerRun, { task, runId: run.id })
    logger.info('Automation task triggered', { taskId: task.id, runId: run.id })
    return true
  }

  // ———————————————— 渲染进程回报 ————————————————

  /** 渲染进程追加运行步骤 */
  public updateRun(runId: string, step: AutomationRunStep): void {
    const run = this.data.runs.find((r) => r.id === runId)
    if (!run || run.status !== 'running') return
    run.steps.push(step)
    this.save()
    this.notifyChanged()
  }

  /** 渲染进程结束运行 */
  public finishRun(runId: string, payload: FinishRunPayload): void {
    const watchdog = this.watchdogs.get(runId)
    if (watchdog) {
      clearTimeout(watchdog)
      this.watchdogs.delete(runId)
    }
    const run = this.data.runs.find((r) => r.id === runId)
    if (!run || run.status !== 'running') {
      logger.warn('finishRun ignored: run not running', { runId })
      return
    }
    run.status = payload.status
    run.finishedAt = Date.now()
    if (payload.output !== undefined) run.output = payload.output
    if (payload.error !== undefined) run.error = payload.error
    this.save()
    this.notifyChanged()
  }

  // ———————————————— 任务 CRUD ————————————————

  public getTasks(): AutomationTask[] {
    return this.data.tasks
  }

  public getRuns(limit = 100): AutomationRun[] {
    return this.data.runs.slice(0, limit)
  }

  public getRun(runId: string): AutomationRun | null {
    return this.data.runs.find((r) => r.id === runId) ?? null
  }

  public saveTask(task: AutomationTask): AutomationTask {
    const now = Date.now()
    const existing = this.data.tasks.find((t) => t.id === task.id)
    if (existing) {
      // 调度状态字段以主进程为准，不随编辑覆盖
      Object.assign(existing, task, {
        lastRunAt: existing.lastRunAt,
        lastTriggerKey: existing.lastTriggerKey,
        updatedAt: now
      })
      this.sanitizeSchedule(existing)
      // C1：编辑任务时把用户选择的输出目录/关联文件目录收录为授权根
      this.captureAuthorizedRoots(existing)
      this.save()
      this.notifyChanged()
      return existing
    }
    // 新建：剔除渲染端带入的调度状态（如「复制任务」会把源任务的 lastRunAt/lastTriggerKey
    // 一并传来，副本会继承"今天已触发"而当天不跑），从零开始调度
    const { lastRunAt: _lr, lastTriggerKey: _ltk, ...rest } = task
    const created: AutomationTask = { ...rest, createdAt: now, updatedAt: now }
    this.sanitizeSchedule(created)
    this.data.tasks.push(created)
    // C1：新建任务时把用户选择的输出目录/关联文件目录收录为授权根
    this.captureAuthorizedRoots(created)
    this.save()
    this.notifyChanged()
    return created
  }

  /** 消毒调度参数：interval 间隔至少 1 分钟（0/负数会导致每 tick 都触发） */
  private sanitizeSchedule(task: AutomationTask): void {
    if (task.schedule.type === 'interval') {
      const minutes = Math.floor(task.schedule.everyMinutes)
      task.schedule = { type: 'interval', everyMinutes: Math.max(1, minutes || 1) }
    }
  }

  public deleteTask(taskId: string): void {
    this.data.tasks = this.data.tasks.filter((t) => t.id !== taskId)
    this.save()
    this.notifyChanged()
  }

  /** 手动「立即运行」：无视时间表，直接触发（不消耗调度状态） */
  public runTaskNow(taskId: string): AutomationRun | null {
    const task = this.data.tasks.find((t) => t.id === taskId)
    if (!task) return null
    const activeRuns = this.data.runs.filter((r) => r.status === 'running').length
    if (activeRuns >= MAX_CONCURRENT_RUNS) return null
    this.triggerRun(task, Date.now(), true)
    this.save()
    this.notifyChanged()
    return this.data.runs[0] ?? null
  }

  // ———————————————— 系统工具 ————————————————

  /**
   * C1：计算当前生效的授权根目录 = 持久化根 ∪ 当前任务里用户选择的路径。
   * 根来自用户在任务配置中通过文件夹/文件选择器指定的 workDir 与 linkedFiles 所在目录。
   * 不信任渲染层传入的 granted 数组，只信任主进程持久化/任务数据。
   */
  private getAuthorizedRoots(): string[] {
    const roots = new Set<string>(this.data.authorizedRoots ?? [])
    for (const task of this.data.tasks) {
      if (task.workDir) roots.add(task.workDir)
      for (const file of task.linkedFiles ?? []) {
        roots.add(path.dirname(file))
      }
    }
    return [...roots].map((r) => path.resolve(r))
  }

  /** C1：首次使用某根目录时，将其收录进持久化的已授权根列表 */
  private captureAuthorizedRoots(task: AutomationTask): void {
    const additions: string[] = []
    if (task.workDir) additions.push(path.resolve(task.workDir))
    for (const file of task.linkedFiles ?? []) additions.push(path.resolve(path.dirname(file)))
    if (additions.length === 0) return
    const roots = new Set(this.data.authorizedRoots ?? [])
    for (const r of additions) roots.add(r)
    this.data.authorizedRoots = [...roots]
  }

  /**
   * C1：路径白名单校验（realpath 后比较，可挡 `..`、绝对路径与符号链接逃逸）。
   * 兼容策略：尚未配置任何授权根（历史数据/未设置输出目录）时放行，避免打断既有自动化；
   * 一旦存在授权根，则仅允许落在这些根及其子目录内的路径。
   */
  private async resolveAllowedPath(requestedPath: string, action: string): Promise<string> {
    const roots = this.getAuthorizedRoots()
    if (roots.length === 0) {
      logger.warn(`Automation ${action}: 未配置授权根目录，放行路径`, { path: requestedPath })
      return path.resolve(requestedPath)
    }
    for (const root of roots) {
      try {
        return await validatePath(requestedPath, root)
      } catch {
        // 不在该根内，尝试下一个根
      }
    }
    throw new Error(`路径不在已授权目录内（仅允许任务中指定的输出目录/关联文件所在目录及其子目录）：${requestedPath}`)
  }

  /** C1-b：拒绝写入系统启动项目录、应用数据目录与危险可执行扩展名 */
  private assertSafeWriteTarget(resolvedPath: string): void {
    const ext = path.extname(resolvedPath).toLowerCase()
    if (BLOCKED_WRITE_EXTENSIONS.has(ext)) {
      throw new Error(`拒绝写入危险可执行文件类型（${ext}）`)
    }
    let blockedDirs: string[] = []
    try {
      blockedDirs = [
        app.getPath('userData'),
        path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
      ]
    } catch {
      // app 未就绪时忽略（正常运行时不会发生）
    }
    for (const dir of blockedDirs) {
      const rel = path.relative(path.resolve(dir), resolvedPath)
      if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
        throw new Error('拒绝写入系统启动项或应用数据目录')
      }
    }
  }

  public async sysFileRead(filePath: string): Promise<AutomationSysFileResult> {
    try {
      const safePath = await this.resolveAllowedPath(filePath, 'file_read')
      const stat = await fsp.stat(safePath)
      if (stat.isDirectory()) return { ok: false, error: '目标是目录，请用 file_list 列出内容' }
      if (stat.size > 1024 * 1024) {
        const fh = await fsp.open(safePath, 'r')
        try {
          const buf = Buffer.alloc(1024 * 1024)
          await fh.read(buf, 0, buf.length, 0)
          return { ok: true, content: buf.toString('utf8') + '\n…[文件超过 1MB，已截断]' }
        } finally {
          await fh.close()
        }
      }
      return { ok: true, content: await fsp.readFile(safePath, 'utf8') }
    } catch (e) {
      return { ok: false, error: `读取失败：${(e as Error).message}` }
    }
  }

  public async sysFileWrite(filePath: string, content: string): Promise<AutomationSysFileResult> {
    try {
      const safePath = await this.resolveAllowedPath(filePath, 'file_write')
      this.assertSafeWriteTarget(safePath)
      await fsp.mkdir(path.dirname(safePath), { recursive: true })
      await fsp.writeFile(safePath, content, 'utf8')
      return { ok: true, content: `已写入 ${Buffer.byteLength(content, 'utf8')} 字节到 ${safePath}` }
    } catch (e) {
      return { ok: false, error: `写入失败：${(e as Error).message}` }
    }
  }

  public async sysFileList(dirPath: string): Promise<AutomationSysFileListResult> {
    try {
      const safePath = await this.resolveAllowedPath(dirPath, 'file_list')
      const stat = await fsp.stat(safePath)
      if (!stat.isDirectory()) return { ok: false, error: '目标不是目录' }
      const dirents = await fsp.readdir(safePath, { withFileTypes: true })
      const entries = dirents.slice(0, 500).map((d) => ({ name: d.name, isDir: d.isDirectory() }))
      if (dirents.length > 500) {
        entries.push({ name: `…[共 ${dirents.length} 项，仅显示前 500 项]`, isDir: false })
      }
      return { ok: true, entries }
    } catch (e) {
      return { ok: false, error: `列目录失败：${(e as Error).message}` }
    }
  }

  public sysPower(action: 'shutdown' | 'restart' | 'lock'): AutomationSysPowerResult {
    // C1-c：非 Windows 平台不支持（命令为 Windows 专用）
    if (!isWin) {
      return { ok: false, error: '当前操作系统不支持电源操作（仅支持 Windows）' }
    }
    const commands: Record<typeof action, string> = {
      shutdown: 'shutdown /s /t 60',
      restart: 'shutdown /r /t 60',
      lock: 'rundll32.exe user32.dll,LockWorkStation'
    }
    const cmd = commands[action]
    // 运行时兜底：非法 action 会得到 undefined，直接 exec(undefined) 会抛 TypeError
    if (!cmd) {
      return { ok: false, error: `不支持的电源操作：${String(action)}` }
    }
    try {
      exec(cmd, (error) => {
        if (error) logger.error('Automation sysPower failed', error)
      })
      const message =
        action === 'lock'
          ? '已执行锁屏'
          : `系统将在 60 秒后${action === 'shutdown' ? '关机' : '重启'}（用户可在 60 秒内以 shutdown /a 取消）`
      logger.info('Automation sysPower executed', { action })
      return { ok: true, message }
    } catch (e) {
      return { ok: false, error: `执行失败：${(e as Error).message}` }
    }
  }

  public destroy(): void {
    if (this.timer) clearInterval(this.timer)
    for (const t of this.watchdogs.values()) clearTimeout(t)
    this.watchdogs.clear()
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      // 退出前同步落盘（fs.writeFileSync，避免异步在退出时丢失）
      try {
        fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf8')
      } catch {
        /* 尽力而为 */
      }
    }
  }
}

export default new AutomationService()
