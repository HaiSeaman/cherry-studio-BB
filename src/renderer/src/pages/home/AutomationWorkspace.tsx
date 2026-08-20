import { CopyOutlined, MoreOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { loggerService } from '@logger'
import { REPORT_TOPIC_NAME } from '@renderer/automation/runner'
import { db } from '@renderer/databases'
import { useAppSelector } from '@renderer/store'
import type { Assistant } from '@renderer/types'
import { getAssistantType } from '@renderer/types'
import type {
  AutomationRun,
  AutomationRunStatus,
  AutomationSchedule,
  AutomationSystemToolId,
  AutomationTask
} from '@shared/automation'
import { WEEKDAY_LABELS, weekdayToJsDay } from '@shared/automation'
import {
  Button,
  Checkbox,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Radio,
  Select,
  Spin,
  Switch,
  Tabs,
  Tag,
  Timeline,
  TimePicker,
  Tooltip
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, FolderOpen, X } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'

const logger = loggerService.withContext('AutomationWorkspace')

/** 调度描述文案 */
function scheduleLabel(task: AutomationTask): string {
  const s = task.schedule
  if (s.type === 'once') return `一次性 · ${dayjs(s.at).format('YYYY-MM-DD HH:mm')}`
  if (s.type === 'interval') {
    const m = s.everyMinutes
    if (m % 1440 === 0) return `每 ${m / 1440} 天`
    if (m % 60 === 0) return `每 ${m / 60} 小时`
    return `每 ${m} 分钟`
  }
  if (s.type === 'weekly') return `每${WEEKDAY_LABELS[s.weekday - 1] ?? '?'} ${s.time}`
  return `每天 ${s.time}`
}

/** 下次运行时间（仅展示估算） */
function nextRunAt(task: AutomationTask): number | null {
  if (!task.enabled) return null
  const s = task.schedule
  const now = Date.now()
  if (s.type === 'once') return s.at > now ? s.at : null
  if (s.type === 'interval') {
    const base = task.lastRunAt ?? task.createdAt
    return base + s.everyMinutes * 60_000
  }
  const [h, m] = s.time.split(':').map(Number)
  if (s.type === 'weekly') {
    const target = weekdayToJsDay(s.weekday)
    let next = dayjs().hour(h).minute(m).second(0).millisecond(0)
    for (let i = 0; i < 8; i++) {
      if (next.day() === target && next.isAfter(dayjs())) return next.valueOf()
      next = next.add(1, 'day')
    }
    return null
  }
  const next = dayjs().hour(h).minute(m).second(0).millisecond(0)
  return (next.isAfter(dayjs()) ? next : next.add(1, 'day')).valueOf()
}

const statusMeta: Record<AutomationRunStatus, { label: string; color: string }> = {
  running: { label: '运行中', color: 'processing' },
  success: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  timeout: { label: '超时', color: 'warning' },
  skipped: { label: '已跳过', color: 'default' }
}

const stepDotColor: Record<string, string> = {
  text: 'var(--color-primary)',
  tool_call: '#2e9bd6',
  tool_result: '#6fbf9b',
  error: 'var(--color-error)'
}

const stepLabel: Record<string, string> = {
  text: 'AI 输出',
  tool_call: '调用工具',
  tool_result: '工具结果',
  error: '错误'
}

/** 每个任务最近一次运行 */
function latestRunForTask(runs: AutomationRun[], taskId: string): AutomationRun | null {
  return runs.find((r) => r.taskId === taskId) ?? null
}

interface Props {
  assistant: Assistant
}

/**
 * 自动化任务助手工作区：挂在 HomePage 的 Chat 位置
 * 左右常驻布局（6:4）：左=概览统计+任务/运行历史/运行记录 tabs；右=任务表单（新建/编辑，不再弹抽屉）
 * 运行详情仍为抽屉（临时查看高密度时间线）
 */
const AutomationWorkspace: FC<Props> = ({ assistant }) => {
  const assistants = useAppSelector((state) => state.assistants.assistants)
  const [tasks, setTasks] = useState<AutomationTask[]>([])
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(true)
  /** 右侧表单目标：null=新建；string=编辑该任务 */
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [viewingRunId, setViewingRunId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([window.api.automation.getTasks(), window.api.automation.getRuns(100)])
      setTasks(t)
      setRuns(r)
    } catch (e) {
      logger.error('Failed to load automation data', e as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  /** 表单完成（保存/取消/目标已删）：回到新建模式并刷新列表 */
  const formDone = useCallback(() => {
    setSelectedTaskId(null)
    void refresh()
  }, [refresh])

  useEffect(() => {
    void refresh()
    const off = window.api.automation.onTasksChanged(() => void refresh())
    return off
  }, [refresh])

  const assistantName = useCallback(
    (id: string) => {
      const a = assistants.find((x) => x.id === id)
      return a ? `${a.name}${a.model ? ` · ${a.model.name}` : ''}` : '（助手已删除）'
    },
    [assistants]
  )

  /** 本助手绑定的任务；其他（绑定在非自动化助手上的遗留任务）单独成组，避免不可达 */
  const myTasks = useMemo(() => tasks.filter((t) => t.assistantId === assistant.id), [tasks, assistant.id])
  const otherTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.assistantId === assistant.id) return false
        const owner = assistants.find((a) => a.id === t.assistantId)
        return !owner || getAssistantType(owner) !== 'automation'
      }),
    [tasks, assistants, assistant.id]
  )

  /** 今日统计（按本助手任务口径） */
  const stats = useMemo(() => {
    const todayStart = dayjs().startOf('day').valueOf()
    const myIds = new Set(myTasks.map((t) => t.id))
    const todayRuns = runs.filter((r) => r.startedAt >= todayStart && myIds.has(r.taskId))
    const next = myTasks
      .map((t) => nextRunAt(t))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b)[0]
    return {
      total: todayRuns.length,
      success: todayRuns.filter((r) => r.status === 'success').length,
      failed: todayRuns.filter((r) => r.status === 'failed' || r.status === 'timeout').length,
      next
    }
  }, [runs, myTasks])

  const toggleEnabled = async (task: AutomationTask, enabled: boolean) => {
    await window.api.automation.saveTask({ ...task, enabled })
    message.success(enabled ? '已启用' : '已暂停')
  }

  const runNow = async (task: AutomationTask) => {
    const run = await window.api.automation.runTask(task.id)
    if (run) {
      message.success('已开始运行')
      setViewingRunId(run.id)
    } else {
      message.warning('当前运行中的任务已达上限（2 个），请稍后再试')
    }
  }

  const duplicate = async (task: AutomationTask) => {
    await window.api.automation.saveTask({
      ...task,
      id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: `${task.name}（副本）`,
      enabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    message.success('已复制（默认暂停）')
  }

  const remove = async (task: AutomationTask) => {
    await window.api.automation.deleteTask(task.id)
    message.success('已删除')
  }

  const renderTaskList = (list: AutomationTask[]) => (
    <TaskList>
      {list.map((task) => {
        const latest = latestRunForTask(runs, task.id)
        const meta = latest ? statusMeta[latest.status] : null
        return (
          <TaskCard key={task.id} $enabled={task.enabled}>
            <TaskMain onClick={() => setSelectedTaskId(task.id)}>
              <TaskName>{task.name}</TaskName>
              <TaskMeta>
                <span>{scheduleLabel(task)}</span>
                <Divider />
                <span>{assistantName(task.assistantId)}</span>
                {task.useMcpTools && (
                  <>
                    <Divider />
                    <span>MCP 工具</span>
                  </>
                )}
                {task.systemTools.length > 0 && (
                  <>
                    <Divider />
                    <span>系统工具 ×{task.systemTools.length}</span>
                  </>
                )}
              </TaskMeta>
            </TaskMain>
            <TaskSide>
              {meta && <Tag color={meta.color}>{meta.label}</Tag>}
              {!task.enabled && <Tag>已暂停</Tag>}
              <Tooltip title={task.enabled ? '暂停' : '启用'}>
                <Switch checked={task.enabled} onChange={(v) => void toggleEnabled(task, v)} />
              </Tooltip>
              <Dropdown
                menu={{
                  items: [
                    { key: 'run', icon: <PlayCircleOutlined />, label: '立即运行' },
                    { key: 'edit', label: '编辑' },
                    { key: 'copy', icon: <CopyOutlined />, label: '复制' },
                    { key: 'delete', label: '删除', danger: true }
                  ],
                  onClick: ({ key }) => {
                    if (key === 'run') void runNow(task)
                    if (key === 'edit') setSelectedTaskId(task.id)
                    if (key === 'copy') void duplicate(task)
                    if (key === 'delete') void remove(task)
                  }
                }}
                trigger={['click']}>
                <MoreBtn aria-label="任务操作">
                  <MoreOutlined />
                </MoreBtn>
              </Dropdown>
            </TaskSide>
          </TaskCard>
        )
      })}
    </TaskList>
  )

  if (loading) {
    return (
      <Container>
        <CenterSpin>
          <Spin />
        </CenterSpin>
      </Container>
    )
  }

  const editingTask = selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) : null

  return (
    <Container>
      <LeftCol>
        <Header>
          <Title>⚡ {assistant.name}</Title>
          <Button type="primary" onClick={() => setSelectedTaskId(null)}>
            新建任务
          </Button>
        </Header>

        <StatsRow>
          <StatCard>
            <StatValue>{stats.total}</StatValue>
            <StatLabel>今日运行</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{stats.success}</StatValue>
            <StatLabel>成功</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue>{stats.failed}</StatValue>
            <StatLabel>失败</StatLabel>
          </StatCard>
          <StatCard>
            <StatValue $small>{stats.next ? dayjs(stats.next).format('MM-DD HH:mm') : '—'}</StatValue>
            <StatLabel>下次运行</StatLabel>
          </StatCard>
        </StatsRow>

        <Content>
          <StyledTabs
            defaultActiveKey="tasks"
            items={[
              {
                key: 'tasks',
                label: `任务 (${myTasks.length})`,
                children:
                  myTasks.length === 0 && otherTasks.length === 0 ? (
                    <EmptyPanel>
                      <Empty description="还没有自动化任务" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                        <Button type="primary" onClick={() => setSelectedTaskId(null)}>
                          创建第一个任务
                        </Button>
                      </Empty>
                    </EmptyPanel>
                  ) : (
                    <>
                      {myTasks.length > 0 ? (
                        renderTaskList(myTasks)
                      ) : (
                        <SectionHint>本助手还没有任务，点上方「新建任务」或右侧表单直接创建</SectionHint>
                      )}
                      {otherTasks.length > 0 && (
                        <>
                          <OtherGroupTitle>绑定在其他助手上的任务</OtherGroupTitle>
                          {renderTaskList(otherTasks)}
                        </>
                      )}
                    </>
                  )
              },
              {
                key: 'runs',
                label: '运行历史',
                children:
                  runs.length === 0 ? (
                    <EmptyPanel>
                      <Empty description="暂无运行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    </EmptyPanel>
                  ) : (
                    <RunList>
                      {runs.map((run) => {
                        const meta = statusMeta[run.status]
                        const duration = run.finishedAt
                          ? Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000))
                          : null
                        return (
                          <RunRow key={run.id} onClick={() => setViewingRunId(run.id)}>
                            <Tag color={meta.color}>{meta.label}</Tag>
                            <RunName>{run.taskName}</RunName>
                            <RunMeta>
                              {dayjs(run.startedAt).format('MM-DD HH:mm:ss')}
                              {duration !== null &&
                                ` · ${duration >= 60 ? `${Math.floor(duration / 60)} 分 ${duration % 60} 秒` : `${duration} 秒`}`}
                              {run.steps.length > 0 && ` · ${run.steps.length} 步`}
                            </RunMeta>
                          </RunRow>
                        )
                      })}
                    </RunList>
                  )
              },
              {
                key: 'records',
                label: '运行记录',
                children: <RecordsView assistant={assistant} />
              }
            ]}
          />
        </Content>
      </LeftCol>

      {/* 右栏：任务表单常驻（新建/编辑切换，不再弹抽屉） */}
      <RightCol>
        <RightHeader>{editingTask ? `编辑任务 · ${editingTask.name}` : '新建任务'}</RightHeader>
        <RightBody>
          <TaskEditForm
            key={selectedTaskId ?? 'new'}
            taskId={selectedTaskId}
            defaultAssistantId={assistant.id}
            onDone={formDone}
          />
        </RightBody>
      </RightCol>

      {/* 运行详情抽屉（原详情页内嵌化，保留完整时间线） */}
      <Drawer
        title="运行详情"
        placement="right"
        width={560}
        open={viewingRunId !== null}
        onClose={() => setViewingRunId(null)}
        destroyOnClose>
        <RunDetailView runId={viewingRunId} />
      </Drawer>
    </Container>
  )
}

/* ---------------- 任务编辑表单（右侧常驻面板） ---------------- */

/** 系统工具分组定义 */
const SYSTEM_TOOL_GROUPS: {
  title: string
  danger?: boolean
  hint?: string
  tools: { id: AutomationSystemToolId; label: string }[]
}[] = [
  {
    title: '文件操作',
    tools: [
      { id: 'file_read', label: '读取文件' },
      { id: 'file_write', label: '写入文件' },
      { id: 'file_list', label: '列出目录' }
    ]
  },
  {
    title: '通知与打开',
    tools: [
      { id: 'notify', label: '发送系统通知' },
      { id: 'open_path', label: '打开文件/程序' },
      { id: 'open_url', label: '打开网页' }
    ]
  },
  {
    title: '电源控制（高危）',
    danger: true,
    hint: '授权后 AI 可在无人值守时直接关机/重启/锁屏（关机与重启有 60 秒宽限期，期间可执行 shutdown /a 取消）。请谨慎勾选。',
    tools: [
      { id: 'shutdown', label: '关机' },
      { id: 'restart', label: '重启' },
      { id: 'lock', label: '锁屏' }
    ]
  }
]

/** 三组工具复选框，共用同一个扁平数组值（antd 一个 Form.Item 只能绑一个 name） */
const SystemToolGroups: FC<{ value?: AutomationSystemToolId[]; onChange?: (v: AutomationSystemToolId[]) => void }> = ({
  value = [],
  onChange
}) => {
  const toggle = (id: AutomationSystemToolId, checked: boolean) => {
    const next = checked ? [...value, id] : value.filter((x) => x !== id)
    onChange?.(next)
  }
  return (
    <ToolGroups>
      {SYSTEM_TOOL_GROUPS.map((group) => (
        <ToolGroup key={group.title} $danger={group.danger}>
          <GroupTitle $danger={group.danger}>{group.title}</GroupTitle>
          {group.hint && <GroupHint $danger={group.danger}>{group.hint}</GroupHint>}
          <CheckboxRow>
            {group.tools.map((t) => (
              <Checkbox key={t.id} checked={value.includes(t.id)} onChange={(e) => toggle(t.id, e.target.checked)}>
                {t.label}
              </Checkbox>
            ))}
          </CheckboxRow>
        </ToolGroup>
      ))}
    </ToolGroups>
  )
}

/** 输出目录选择器：系统文件夹选择对话框，绑定 Form.Item name="workDir" */
const WorkDirPicker: FC<{ value?: string; onChange?: (v?: string) => void }> = ({ value, onChange }) => {
  const pick = async () => {
    const folder = await window.api.file.selectFolder().catch(() => null)
    if (folder) onChange?.(folder)
  }
  return (
    <PickerRow>
      {value ? (
        <>
          <PathText title={value}>{value}</PathText>
          <Button size="small" icon={<X size={13} />} onClick={() => onChange?.(undefined)}>
            清除
          </Button>
        </>
      ) : (
        <Button icon={<FolderOpen size={14} />} onClick={() => void pick()}>
          选择文件夹
        </Button>
      )}
    </PickerRow>
  )
}

/** 指定文件选择器：系统多选文件对话框，绑定 Form.Item name="linkedFiles" */
const LinkedFilesPicker: FC<{ value?: string[]; onChange?: (v: string[]) => void }> = ({ value = [], onChange }) => {
  const pick = async () => {
    const files = await window.api.file.select({ properties: ['openFile', 'multiSelections'] }).catch(() => null)
    if (!files || files.length === 0) return
    // 去重追加
    const next = [...value]
    for (const f of files) {
      if (!next.includes(f.path)) next.push(f.path)
    }
    onChange?.(next)
  }
  return (
    <PickerColumn>
      {value.map((f) => (
        <PickerRow key={f}>
          <PathText title={f}>
            <FileText size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
            {f}
          </PathText>
          <Button size="small" icon={<X size={13} />} onClick={() => onChange?.(value.filter((x) => x !== f))} />
        </PickerRow>
      ))}
      <Button icon={<FileText size={14} />} onClick={() => void pick()} style={{ alignSelf: 'flex-start' }}>
        添加文件
      </Button>
    </PickerColumn>
  )
}

interface FormValues {
  name: string
  assistantId: string
  instruction: string
  scheduleType: AutomationSchedule['type']
  onceAt?: Dayjs
  everyMinutes?: number
  dailyTime?: Dayjs
  weekday?: number
  useMcpTools: boolean
  systemTools: AutomationSystemToolId[]
  notifyOnComplete: boolean
  enabled: boolean
  workDir?: string
  linkedFiles?: string[]
}

const TaskEditForm: FC<{ taskId: string | null; defaultAssistantId: string; onDone: () => void }> = ({
  taskId,
  defaultAssistantId,
  onDone
}) => {
  const isEdit = !!taskId
  const assistants = useAppSelector((state) => state.assistants.assistants)
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(isEdit)
  const scheduleType = Form.useWatch('scheduleType', form) ?? 'daily'

  useEffect(() => {
    if (!taskId) return
    void window.api.automation
      .getTasks()
      .then((tasks) => {
        const task = tasks.find((t) => t.id === taskId)
        if (!task) {
          message.error('任务不存在')
          onDone()
          return
        }
        const [h, m] =
          task.schedule.type === 'daily' || task.schedule.type === 'weekly'
            ? task.schedule.time.split(':').map(Number)
            : [0, 0]
        form.setFieldsValue({
          name: task.name,
          assistantId: task.assistantId,
          instruction: task.instruction,
          scheduleType: task.schedule.type,
          onceAt: task.schedule.type === 'once' ? dayjs(task.schedule.at) : undefined,
          everyMinutes: task.schedule.type === 'interval' ? task.schedule.everyMinutes : undefined,
          // dayjs 未装 customParseFormat 插件，手动拆 HH:mm
          dailyTime:
            task.schedule.type === 'daily' || task.schedule.type === 'weekly'
              ? dayjs().hour(h).minute(m).second(0)
              : undefined,
          weekday: task.schedule.type === 'weekly' ? task.schedule.weekday : undefined,
          useMcpTools: task.useMcpTools,
          systemTools: task.systemTools,
          notifyOnComplete: task.notifyOnComplete,
          enabled: task.enabled,
          workDir: task.workDir,
          linkedFiles: task.linkedFiles ?? []
        })
      })
      .catch((e) => logger.error('Failed to load task', e as Error))
      .finally(() => setLoading(false))
  }, [taskId, form, onDone])

  const assistantOptions = useMemo(
    () =>
      assistants
        .filter((a) => a.id !== 'default')
        .map((a) => ({
          value: a.id,
          label: `${a.name}${a.model ? `（${a.model.name}）` : '（未设置模型）'}`
        })),
    [assistants]
  )

  const onSave = async (values: FormValues) => {
    const existing = isEdit ? (await window.api.automation.getTasks()).find((t) => t.id === taskId) : undefined
    if (!existing && isEdit) {
      message.error('任务不存在')
      return
    }

    let schedule: AutomationSchedule
    if (values.scheduleType === 'once') {
      if (!values.onceAt) {
        message.error('请选择触发时间')
        return
      }
      schedule = { type: 'once', at: values.onceAt.valueOf() }
    } else if (values.scheduleType === 'interval') {
      if (!values.everyMinutes || values.everyMinutes < 1) {
        message.error('间隔分钟数至少为 1')
        return
      }
      schedule = { type: 'interval', everyMinutes: values.everyMinutes }
    } else if (values.scheduleType === 'weekly') {
      if (!values.dailyTime) {
        message.error('请选择每周运行的时间')
        return
      }
      schedule = { type: 'weekly', weekday: values.weekday ?? 1, time: values.dailyTime.format('HH:mm') }
    } else {
      if (!values.dailyTime) {
        message.error('请选择每天运行的时间')
        return
      }
      schedule = { type: 'daily', time: values.dailyTime.format('HH:mm') }
    }

    const task: AutomationTask = {
      id: existing?.id ?? `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: values.name.trim(),
      assistantId: values.assistantId,
      instruction: values.instruction.trim(),
      schedule,
      enabled: values.enabled,
      systemTools: values.systemTools,
      useMcpTools: values.useMcpTools,
      notifyOnComplete: values.notifyOnComplete,
      ...(values.workDir ? { workDir: values.workDir } : {}),
      ...(values.linkedFiles && values.linkedFiles.length > 0 ? { linkedFiles: values.linkedFiles } : {}),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...(existing?.lastRunAt !== undefined ? { lastRunAt: existing.lastRunAt } : {}),
      ...(existing?.lastTriggerKey !== undefined ? { lastTriggerKey: existing.lastTriggerKey } : {})
    }
    await window.api.automation.saveTask(task)
    message.success(isEdit ? '已保存' : '任务已创建')
    onDone()
  }

  if (loading) {
    return (
      <CenterSpin>
        <Spin />
      </CenterSpin>
    )
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={(v) => void onSave(v)}
      initialValues={{
        scheduleType: 'daily',
        assistantId: defaultAssistantId,
        useMcpTools: false,
        systemTools: [] as AutomationSystemToolId[],
        notifyOnComplete: true,
        enabled: true
      }}>
      <Section>
        <SectionTitle>基本信息</SectionTitle>
        <Form.Item
          name="name"
          label="任务名称"
          rules={[
            { required: true, message: '请输入任务名称' },
            { max: 50, message: '名称过长' }
          ]}>
          <Input placeholder="例如：每日新闻摘要" />
        </Form.Item>
        <Form.Item
          name="assistantId"
          label="执行助手"
          rules={[{ required: true, message: '请选择助手' }]}
          extra="将使用该助手的提示词、模型和已配置的 MCP 工具">
          <Select options={assistantOptions} placeholder="选择助手" showSearch optionFilterProp="label" />
        </Form.Item>
        <Form.Item
          name="instruction"
          label="任务指令"
          rules={[{ required: true, message: '请输入任务指令' }]}
          extra="用自然语言描述要做什么，AI 会自动决定调用哪些工具完成">
          <Input.TextArea
            rows={4}
            placeholder="例如：总结我桌面「日记」文件夹里今天的日记，把摘要写入桌面「日报.txt」并发通知告诉我"
          />
        </Form.Item>
      </Section>

      <Section>
        <SectionTitle>时间表</SectionTitle>
        <Form.Item name="scheduleType" label="触发方式">
          <Radio.Group
            options={[
              { value: 'daily', label: '每天定时' },
              { value: 'weekly', label: '每周定时' },
              { value: 'interval', label: '固定间隔' },
              { value: 'once', label: '一次性' }
            ]}
          />
        </Form.Item>
        {(scheduleType === 'daily' || scheduleType === 'weekly') && (
          <Form.Item label={scheduleType === 'weekly' ? '星期与时间' : '每天运行时间'}>
            {scheduleType === 'weekly' && (
              <Form.Item name="weekday" noStyle initialValue={1}>
                <Select
                  style={{ width: 96, marginRight: 8 }}
                  options={WEEKDAY_LABELS.map((label, i) => ({ label, value: i + 1 }))}
                />
              </Form.Item>
            )}
            <Form.Item name="dailyTime" noStyle>
              <TimePicker format="HH:mm" style={{ width: 120 }} />
            </Form.Item>
          </Form.Item>
        )}
        {scheduleType === 'interval' && (
          <Form.Item name="everyMinutes" label="间隔（分钟）" extra="从上次运行完成时间起算">
            <InputNumber min={1} max={525600} style={{ width: 160 }} />
          </Form.Item>
        )}
        {scheduleType === 'once' && (
          <Form.Item name="onceAt" label="触发时间" extra="错过触发时间（软件未运行）将标记为已跳过并自动停用">
            <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: 220 }} />
          </Form.Item>
        )}
      </Section>

      <Section>
        <SectionTitle>工具与权限</SectionTitle>
        <Form.Item
          name="useMcpTools"
          label="允许使用 MCP 工具"
          valuePropName="checked"
          extra="使用该助手已配置且启用的 MCP 服务器工具（无需逐个确认）">
          <Switch />
        </Form.Item>
        <Form.Item label="系统工具授权" required>
          <Form.Item name="systemTools" noStyle>
            <SystemToolGroups />
          </Form.Item>
        </Form.Item>
        <Form.Item label="输出目录" extra="AI 生成文档默认保存到这里（需勾选「写入文件」）；运行时注入任务上下文">
          <Form.Item name="workDir" noStyle>
            <WorkDirPicker />
          </Form.Item>
        </Form.Item>
        <Form.Item label="指定文件" extra="任务要读取/修改的本地文件（需勾选对应文件工具）；运行时注入任务上下文">
          <Form.Item name="linkedFiles" noStyle>
            <LinkedFilesPicker />
          </Form.Item>
        </Form.Item>
      </Section>

      <Section>
        <SectionTitle>通知与其他</SectionTitle>
        <Form.Item
          name="notifyOnComplete"
          label="运行结束后通知我"
          valuePropName="checked"
          extra="受 设置 → 常规 → 通知设置 → 自动化 开关控制">
          <Switch />
        </Form.Item>
        <Form.Item name="enabled" label="创建后立即启用" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Section>

      <Footer>
        <Button onClick={onDone}>重置</Button>
        <Button type="primary" htmlType="submit">
          保存
        </Button>
      </Footer>
    </Form>
  )
}

/* ---------------- 运行详情（原 AutomationRunDetailPage 抽屉化） ---------------- */

const RunDetailView: FC<{ runId: string | null }> = ({ runId }) => {
  const [run, setRun] = useState<AutomationRun | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!runId) return
    try {
      setRun(await window.api.automation.getRun(runId))
    } catch (e) {
      logger.error('Failed to load run', e as Error)
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    void refresh()
    const off = window.api.automation.onTasksChanged(() => void refresh())
    return off
  }, [refresh])

  if (loading) {
    return (
      <CenterSpin>
        <Spin />
      </CenterSpin>
    )
  }

  if (!run) {
    return (
      <CenterSpin>
        <Empty description="运行记录不存在" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </CenterSpin>
    )
  }

  const meta = statusMeta[run.status]
  const duration = run.finishedAt ? Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000)) : null

  return (
    <div>
      <RunTitleBar>
        <span style={{ fontWeight: 600 }}>{run.taskName}</span>
        <Tag color={meta.color}>{meta.label}</Tag>
      </RunTitleBar>
      <InfoBar>
        <span>开始：{dayjs(run.startedAt).format('YYYY-MM-DD HH:mm:ss')}</span>
        {duration !== null && (
          <span>耗时：{duration >= 60 ? `${Math.floor(duration / 60)} 分 ${duration % 60} 秒` : `${duration} 秒`}</span>
        )}
        <span>步骤：{run.steps.length}</span>
      </InfoBar>

      {run.note && <NoteBar>{run.note}</NoteBar>}
      {run.error && <ErrorBar>{run.error}</ErrorBar>}

      <Timeline
        style={{ marginTop: 16 }}
        items={run.steps.map((step, i) => ({
          key: i,
          color: stepDotColor[step.type] ?? 'gray',
          children: (
            <StepItem>
              <StepHead>
                <StepLabel $type={step.type}>{stepLabel[step.type] ?? step.type}</StepLabel>
                <StepTime>{dayjs(step.time).format('HH:mm:ss')}</StepTime>
              </StepHead>
              <StepContent>{step.content}</StepContent>
            </StepItem>
          )
        }))}
      />

      {run.output && (
        <OutputBlock>
          <OutputTitle>最终输出</OutputTitle>
          <OutputText>{run.output}</OutputText>
        </OutputBlock>
      )}
    </div>
  )
}

/* ---------------- 运行记录（执行简报卡片查看，直读 db 的轻量渲染） ---------------- */

type ReportRow = {
  id: string
  topicId: string
  messages: { id: string; role: string; blocks?: string[]; createdAt?: string }[]
  blocks: { id: string; content?: string }[]
}

const RecordsView: FC<{ assistant: Assistant }> = ({ assistant }) => {
  const topic = (assistant.topics ?? []).find((t) => t.name === REPORT_TOPIC_NAME)
  const data = useLiveQuery(async () => {
    if (!topic) return null
    const row = (await db.topics.get(topic.id)) as ReportRow | undefined
    if (!row) return null
    const blockIds = (row.messages ?? []).flatMap((m) => m.blocks ?? [])
    const blocks = blockIds.length > 0 ? await db.message_blocks.where('id').anyOf(blockIds).toArray() : []
    return { messages: row.messages ?? [], blocks }
  }, [topic?.id])

  if (!topic || !data || data.messages.length === 0) {
    return (
      <EmptyPanel>
        <Empty description="暂无执行简报（任务运行结束后自动写入）" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </EmptyPanel>
    )
  }

  return (
    <RunList>
      {data.messages.map((m) => {
        const text = (m.blocks ?? [])
          .map((id) => (data.blocks.find((b) => b.id === id) as { id: string; content?: string } | undefined)?.content)
          .filter(Boolean)
          .join('\n')
        if (!text) return null
        return (
          <ReportCard key={m.id}>
            <pre>{text}</pre>
          </ReportCard>
        )
      })}
    </RunList>
  )
}

/* ---------------- 样式 ---------------- */

/** 左右常驻布局：左 6（概览+列表）/ 右 4（任务表单），窄屏上下堆叠 */
const Container = styled.div`
  display: flex;
  gap: 14px;
  height: 100%;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px;
  background: var(--color-background);
  @media (max-width: 1100px) {
    flex-direction: column;
    overflow-y: auto;
  }
`

const LeftCol = styled.div`
  flex: 6;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
`

const RightCol = styled.div`
  flex: 4;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
`

const RightHeader = styled.div`
  padding: 14px 18px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
`

const RightBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
  }
`

const CenterSpin = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 12px;
`

const Title = styled.h1`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
`

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 0 2px 12px;
`

const StatCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;
`

const StatValue = styled.div<{ $small?: boolean }>`
  font-size: ${(p) => (p.$small ? '16px' : '22px')};
  font-weight: 600;
  color: var(--color-text);
`

const StatLabel = styled.div`
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-2);
`

const Content = styled.div`
  flex: 1;
  min-height: 0;
  padding: 0 2px;
  overflow-y: auto;
`

const StyledTabs = styled(Tabs)`
  height: 100%;
  .ant-tabs-content-holder {
    overflow-y: auto;
  }
`

const EmptyPanel = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
`

const SectionHint = styled.div`
  padding: 12px;
  font-size: 13px;
  color: var(--color-text-3);
`

const OtherGroupTitle = styled.div`
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-2);
`

const GroupTitle = styled.div<{ $danger?: boolean }>`
  margin-bottom: 8px;
  font-weight: 500;
  color: ${(p) => (p.$danger ? 'var(--color-error)' : 'var(--color-text)')};
`

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const TaskCard = styled.div<{ $enabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  opacity: ${(p) => (p.$enabled ? 1 : 0.65)};
  transition: border-color 0.15s ease;
  &:hover {
    border-color: ${(p) => (p.$enabled ? 'var(--color-primary)' : 'var(--color-border)')};
  }
`

const TaskMain = styled.div`
  flex: 1;
  min-width: 0;
  cursor: pointer;
`

const TaskName = styled.div`
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
`

const TaskMeta = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-2);
`

const Divider = styled.span`
  color: var(--color-border);
`

const TaskSide = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
`

const MoreBtn = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-2);
  &:hover {
    background: var(--color-background);
    color: var(--color-text);
  }
`

const RunList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const RunRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  &:hover {
    background: var(--color-background-soft);
  }
`

const RunName = styled.span`
  font-size: 14px;
  color: var(--color-text);
`

const RunMeta = styled.span`
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-2);
`

const ReportCard = styled.div`
  padding: 12px 14px;
  margin: 6px 0;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;

  pre {
    margin: 0;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.7;
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-word;
  }
`

const RunTitleBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`

const InfoBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--color-text-2);
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 8px;
`

const NoteBar = styled.div`
  margin-top: 10px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--color-text-2);
  background: var(--color-background-soft);
  border-radius: 8px;
`

const ErrorBar = styled.div`
  margin-top: 10px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--color-error);
  background: var(--color-background-soft);
  border-radius: 8px;
`

const StepItem = styled.div`
  min-width: 0;
`

const StepHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
`

const StepLabel = styled.span<{ $type: string }>`
  font-size: 12px;
  font-weight: 500;
  color: ${(p) => stepDotColor[p.$type] ?? 'var(--color-text-2)'};
`

const StepTime = styled.span`
  font-size: 11px;
  color: var(--color-text-2);
`

const StepContent = styled.div`
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-all;
`

const OutputBlock = styled.div`
  margin-top: 20px;
  padding: 16px;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 10px;
`

const OutputTitle = styled.div`
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
`

const OutputText = styled.div`
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
`

/** 表单分区卡：在右栏 soft 背景容器中用背景色形成层次 */
const Section = styled.div`
  padding: 14px;
  margin-bottom: 12px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 10px;
`

const SectionTitle = styled.div`
  margin-bottom: 16px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
`

const ToolGroups = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const CheckboxRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
`

const ToolGroup = styled.div<{ $danger?: boolean }>`
  padding: 12px;
  border: 1px solid ${(p) => (p.$danger ? 'var(--color-error)' : 'var(--color-border)')};
  border-radius: 8px;
`

const GroupHint = styled.div<{ $danger?: boolean }>`
  margin-bottom: 8px;
  font-size: 12px;
  color: ${(p) => (p.$danger ? 'var(--color-error)' : 'var(--color-text-2)')};
`

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 8px;
`

const PickerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`

const PickerColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
`

const PathText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-2);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 4px 8px;
`

export default AutomationWorkspace
