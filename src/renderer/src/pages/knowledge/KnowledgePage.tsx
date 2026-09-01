import { isEmbeddingModel, isRerankModel } from '@renderer/config/models'
import { useProviders } from '@renderer/hooks/useProvider'
import type { Model } from '@renderer/types'
import {
  Badge,
  Button,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip
} from 'antd'
import {
  BookOpen,
  BookPlus,
  ChevronDown,
  Copy,
  Cpu,
  Database,
  FileCheck2,
  FileCode,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Layers,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Zap
} from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'

import { KnowledgeService } from './KnowledgeService'
import { searchKnowledge } from './search'
import type { KBFile, KBFileStatus, KBHit, KnowledgeBase } from './types'

const STATUS_CONFIG: Record<KBFileStatus, { color: string; label: string }> = {
  pending: { color: '#8c8c8c', label: '待处理' },
  parsing: { color: '#1677ff', label: '解析中' },
  chunking: { color: '#722ed1', label: '切块中' },
  embedding: { color: '#13c2c2', label: '向量化' },
  ready: { color: '#52c41a', label: '就绪' },
  error: { color: '#ff4d4f', label: '失败' }
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (['md', 'markdown', 'txt'].includes(ext)) return <FileText size={16} color="#1677ff" />
  if (['json', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'html', 'css'].includes(ext)) {
    return <FileCode size={16} color="#722ed1" />
  }
  if (['csv', 'xlsx', 'xls'].includes(ext)) return <FileSpreadsheet size={16} color="#52c41a" />
  return <FileCheck2 size={16} color="#fa8c16" />
}

const KnowledgePage: FC = () => {
  const { providers } = useProviders()
  const embeddingModels = useMemo(
    () =>
      providers
        .map((p) => p.models)
        .flat()
        .filter((m) => isEmbeddingModel(m)),
    [providers]
  )

  const rerankModels = useMemo(
    () =>
      providers
        .map((p) => p.models)
        .flat()
        .filter((m) => isRerankModel(m)),
    [providers]
  )

  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [activeBase, setActiveBase] = useState<KnowledgeBase | null>(null)
  const [files, setFiles] = useState<KBFile[]>([])
  const [busy, setBusy] = useState(false)
  const [fileFilter, setFileFilter] = useState('')

  // 建库弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [kbName, setKbName] = useState('')
  const [kbModel, setKbModel] = useState<Model | undefined>()
  const [kbRerankModel, setKbRerankModel] = useState<Model | undefined>()

  // 检索调试
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<KBHit[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedHit, setSelectedHit] = useState<KBHit | null>(null)

  // 设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chunkSize, setChunkSize] = useState(1024)
  const [chunkOverlap, setChunkOverlap] = useState(200)
  const [topK, setTopK] = useState(6)
  const [rerankModel, setRerankModel] = useState<Model | undefined>()

  const refresh = useCallback(async () => {
    const list = await KnowledgeService.listBases()
    setBases(list)
    setActiveBase((prev) => {
      if (prev && list.some((b) => b.id === prev.id)) return prev
      return list[0] ?? null
    })
  }, [])

  const refreshFiles = useCallback(async (baseId: string) => {
    setFiles(await KnowledgeService.listFiles(baseId))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (activeBase) {
      void refreshFiles(activeBase.id)
    }
  }, [activeBase, refreshFiles])

  const selectBase = (b: KnowledgeBase) => {
    setActiveBase(b)
    setHits([])
    setSelectedHit(null)
    setFileFilter('')
  }

  const createBase = async () => {
    if (!kbName.trim() || !kbModel) {
      message.warning('请填写知识库名称并选择嵌入模型')
      return
    }
    try {
      await KnowledgeService.createBase(kbName.trim(), kbModel, kbRerankModel)
      message.success('知识库创建成功')
      setKbName('')
      setKbModel(undefined)
      setKbRerankModel(undefined)
      setCreateOpen(false)
      await refresh()
    } catch (error) {
      message.error(`创建失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const importFiles = async () => {
    if (!activeBase) return
    const selected = await window.api.file.select({ properties: ['openFile', 'multiSelections'] })
    if (!selected || selected.length === 0) return
    setBusy(true)
    let added = 0
    let skipped = 0
    let failed = 0
    for (const f of selected) {
      try {
        const r = await KnowledgeService.addFile(activeBase, f.path, () => {
          if (activeBase) void refreshFiles(activeBase.id)
        })
        if (r.status === 'duplicate') skipped += 1
        else added += 1
      } catch {
        failed += 1
      }
    }
    setBusy(false)
    message.success(
      `导入完成：新增 ${added} 个${skipped ? `，重复跳过 ${skipped} 个` : ''}${failed ? `，失败 ${failed} 个` : ''}`
    )
    await refreshFiles(activeBase.id)
  }

  const importFolder = async () => {
    if (!activeBase) return
    const folder = await window.api.file.selectFolder()
    if (!folder) return
    setBusy(true)
    try {
      const { added, skipped, failed, truncated } = await KnowledgeService.addFolder(activeBase, folder, () => {
        if (activeBase) void refreshFiles(activeBase.id)
      })
      message.success(
        `导入完成：新增 ${added} 个文件${skipped ? `，重复跳过 ${skipped} 个` : ''}${failed ? `，失败 ${failed} 个` : ''}`
      )
      if (truncated) message.warning('文件夹过大，仅导入了前 2000 个文件')
    } catch (error) {
      message.error(`导入文件夹失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
      await refreshFiles(activeBase.id)
    }
  }

  const removeFile = async (file: KBFile) => {
    await KnowledgeService.deleteFile(file.id)
    setFiles((f) => f.filter((x) => x.id !== file.id))
    if (selectedHit?.file.id === file.id) {
      setSelectedHit(null)
    }
  }

  const removeBase = async (base: KnowledgeBase) => {
    await KnowledgeService.deleteBase(base.id)
    if (activeBase?.id === base.id) setActiveBase(null)
    setHits([])
    setSelectedHit(null)
    await refresh()
  }

  const doSearch = async () => {
    if (!activeBase || !query.trim()) return
    setSearching(true)
    try {
      const result = await searchKnowledge(activeBase, query.trim())
      setHits(result)
      if (result.length > 0) {
        setSelectedHit(result[0])
      } else {
        setSelectedHit(null)
      }
    } catch (error) {
      message.error(`检索失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSearching(false)
    }
  }

  const openSettings = () => {
    if (!activeBase) return
    setChunkSize(activeBase.chunk_size)
    setChunkOverlap(activeBase.chunk_overlap)
    setTopK(activeBase.top_k)
    setRerankModel(
      activeBase.rerank_model_id ? rerankModels.find((m) => m.id === activeBase.rerank_model_id) : undefined
    )
    setSettingsOpen(true)
  }

  const saveSettings = async () => {
    if (!activeBase) return
    await KnowledgeService.updateBaseSettings(activeBase.id, {
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      top_k: topK,
      rerank_model_id: rerankModel?.id,
      rerank_provider_id: rerankModel?.provider
    })
    message.success('设置已保存（重排模型即时生效，切块参数只影响之后新添加的内容）')
    setSettingsOpen(false)
    await refresh()
  }

  const copySelectedContent = async () => {
    if (!selectedHit) return
    try {
      await navigator.clipboard.writeText(selectedHit.chunk.text)
      message.success('已复制所选文本内容')
    } catch {
      message.error('复制失败，请手动选中复制')
    }
  }

  const filteredFiles = useMemo(() => {
    if (!fileFilter.trim()) return files
    return files.filter((f) => f.name.toLowerCase().includes(fileFilter.toLowerCase()))
  }, [files, fileFilter])

  const totalChunks = useMemo(() => files.reduce((acc, f) => acc + (f.chunk_count || 0), 0), [files])
  const readyCount = useMemo(() => files.filter((f) => f.status === 'ready').length, [files])
  const totalSizeKB = useMemo(() => (files.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1), [files])

  const importMenuItems = [
    { key: 'files', icon: <FileText size={15} />, label: '导入本地文件（多选）', onClick: () => void importFiles() },
    { key: 'folder', icon: <FolderPlus size={15} />, label: '导入整个文件夹', onClick: () => void importFolder() }
  ]

  const sourceLabel = (h: KBHit): string => {
    const s = h.chunk.source
    if (s?.type === 'page') return `第 ${s.page ?? '?'} 页`
    if (s?.type === 'line') return `第 ${s.lineStart ?? '?'}-${s.lineEnd ?? '?'} 行`
    return `段落 ${s?.paraStart ?? '?'}-${s?.paraEnd ?? '?'}`
  }

  return (
    <PageLayout>
      {/* ── 1. 左侧知识库导航栏 (240px) ── */}
      <Sidebar>
        <SidebarHeader>
          <div className="title-group">
            <BookOpen size={18} className="icon-primary" />
            <h2>知识库</h2>
            <Badge count={bases.length} style={{ backgroundColor: 'var(--color-primary)' }} />
          </div>
          <Button
            type="primary"
            size="small"
            icon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
            className="create-btn">
            新建
          </Button>
        </SidebarHeader>

        <SidebarList>
          {bases.length === 0 ? (
            <EmptyBox>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无知识库"
                children={
                  <Button type="dashed" size="small" icon={<BookPlus size={13} />} onClick={() => setCreateOpen(true)}>
                    创建第一个
                  </Button>
                }
              />
            </EmptyBox>
          ) : (
            bases.map((b) => {
              const isActive = activeBase?.id === b.id
              return (
                <KbItemCard key={b.id} $active={isActive} onClick={() => selectBase(b)}>
                  <div className="kb-card-header">
                    <Database size={15} className={isActive ? 'icon-active' : 'icon-muted'} />
                    <span className="kb-title">{b.name}</span>
                    <Popconfirm
                      title="确定删除知识库？"
                      description="将彻底删除该库所有索引与切块"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={(e) => {
                        e?.stopPropagation()
                        void removeBase(b)
                      }}>
                      <button className="del-btn" onClick={(e) => e.stopPropagation()} title="删除知识库">
                        <Trash2 size={13} />
                      </button>
                    </Popconfirm>
                  </div>
                  <div className="kb-model-tag">
                    <Cpu size={12} />
                    <span>{b.embedding_model_id || '默认嵌入模型'}</span>
                  </div>
                </KbItemCard>
              )
            })
          )}
        </SidebarList>
      </Sidebar>

      {/* ── 2. 中间主舞台：智能语义召回调试与沉浸式阅读器 (Flex: 1 撑满大屏) ── */}
      <MainStage>
        {activeBase ? (
          <>
            {/* 顶部长条控制栏 */}
            <HeaderBar>
              <div className="header-left">
                <div className="title-section">
                  <h1>{activeBase.name}</h1>
                  <Tag color="blue" icon={<Cpu size={12} style={{ verticalAlign: -1, marginRight: 4 }} />}>
                    {activeBase.embedding_model_id}
                  </Tag>
                </div>
                <div className="param-badges">
                  <span className="param-item">
                    切块大小: <strong>{activeBase.chunk_size || 1024}</strong>
                  </span>
                  <span className="param-item">
                    重叠: <strong>{activeBase.chunk_overlap || 200}</strong>
                  </span>
                  <span className="param-item">
                    TopK: <strong>{activeBase.top_k || 6}</strong>
                  </span>
                  {activeBase.rerank_model_id && (
                    <span className="param-item rerank">
                      重排: <strong>{activeBase.rerank_model_id}</strong>
                    </span>
                  )}
                </div>
              </div>
              <div className="header-right">
                <Button icon={<SlidersHorizontal size={14} />} onClick={openSettings}>
                  切块与召回参数
                </Button>
              </div>
            </HeaderBar>

            {/* 核心检索提问输入区 */}
            <SearchConsole>
              <div className="search-box-wrapper">
                <Input.TextArea
                  rows={2}
                  placeholder="输入问题或文本片段，回车 (Enter) 快速测试智能召回效果..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void doSearch()
                    }
                  }}
                  className="search-input"
                />
                <div className="search-actions">
                  <div className="search-tips">
                    <Sparkles size={13} className="icon-sparkle" />
                    <span>基于向量余弦相似度实时计算</span>
                  </div>
                  <Button
                    type="primary"
                    icon={<Search size={14} />}
                    loading={searching}
                    onClick={() => void doSearch()}
                    disabled={!query.trim()}>
                    开始语义检索
                  </Button>
                </div>
              </div>
            </SearchConsole>

            {/* 核心展示区：左右分栏沉浸式阅读器（左候选列表，右全景高亮正文） */}
            <RecallWorkspace>
              {searching ? (
                <div className="workspace-loading">
                  <Spin size="large" tip="正在进行高维向量空间计算与召回匹配..." />
                </div>
              ) : hits.length === 0 ? (
                <WorkspaceEmpty>
                  <div className="empty-box">
                    <div className="empty-icon-circle">
                      <Zap size={32} color="var(--color-primary)" />
                    </div>
                    <h3>智能语义检索沙箱</h3>
                    <p>
                      在上方输入任何问题或核心词，系统将自动使用 <strong>{activeBase.embedding_model_id}</strong>{' '}
                      模型提取语义特征，并在毫秒级内从右侧 <strong>{files.length}</strong> 个文档（共{' '}
                      <strong>{totalChunks}</strong> 个切块）中召回最匹配的段落。
                    </p>
                    <div className="quick-guide">
                      <div className="guide-item">
                        <span className="num">1</span>
                        <span>在右侧添加或导入你的知识文档</span>
                      </div>
                      <div className="guide-item">
                        <span className="num">2</span>
                        <span>等待文档解析与向量化完成</span>
                      </div>
                      <div className="guide-item">
                        <span className="num">3</span>
                        <span>在上方输入提问，验证 AI 回答所依据的段落</span>
                      </div>
                    </div>
                  </div>
                </WorkspaceEmpty>
              ) : (
                <ResultsSplit>
                  {/* 左侧：命中片段卡片流 (360px) */}
                  <HitsColumn>
                    <div className="hits-header">
                      <span className="hits-title">召回命中结果 ({hits.length})</span>
                      <span className="hits-sub">按相似度排序</span>
                    </div>
                    <div className="hits-scroll">
                      {hits.map((h, idx) => {
                        const isCur = selectedHit?.chunk.id === h.chunk.id
                        const scorePercent = (h.score * 100).toFixed(1)
                        const isHigh = Number(scorePercent) > 75
                        return (
                          <HitCard key={h.chunk.id} $active={isCur} onClick={() => setSelectedHit(h)}>
                            <div className="hit-card-top">
                              <span className="rank-badge">#{idx + 1}</span>
                              <span className="file-name" title={h.file.name}>
                                {h.file.name}
                              </span>
                              <Tag color={isHigh ? 'green' : 'blue'}>{scorePercent}%</Tag>
                            </div>
                            <div className="hit-preview">{h.chunk.text}</div>
                            <div className="hit-card-bottom">
                              <span className="source-info">{sourceLabel(h)}</span>
                              <span className="view-link">查看全文 →</span>
                            </div>
                          </HitCard>
                        )
                      })}
                    </div>
                  </HitsColumn>

                  {/* 右侧：沉浸式阅读与全文高亮工作区 (Flex: 1) */}
                  <ReadingPane>
                    {selectedHit ? (
                      <>
                        <div className="reading-header">
                          <div className="meta-group">
                            <div className="file-title-row">
                              {getFileIcon(selectedHit.file.name)}
                              <h2>{selectedHit.file.name}</h2>
                            </div>
                            <div className="source-row">
                              <span className="source-badge">{sourceLabel(selectedHit)}</span>
                              <span className="score-badge">
                                相似度得分：<strong>{(selectedHit.score * 100).toFixed(2)}%</strong>
                              </span>
                            </div>
                          </div>
                          <Button icon={<Copy size={14} />} onClick={() => void copySelectedContent()}>
                            复制选中文本
                          </Button>
                        </div>
                        <div className="reading-body">
                          <pre className="text-content">{selectedHit.chunk.text}</pre>
                        </div>
                      </>
                    ) : (
                      <div className="no-selection">点击左侧召回卡片查看完整段落</div>
                    )}
                  </ReadingPane>
                </ResultsSplit>
              )}
            </RecallWorkspace>
          </>
        ) : (
          <StageEmpty>
            <BookOpen size={48} className="empty-icon" />
            <h3>请选择或创建一个知识库</h3>
            <p>通过 RAG 向量知识库，赋能大模型精准理解你的私有文件与专业资料。</p>
            <Button type="primary" size="large" icon={<BookPlus size={16} />} onClick={() => setCreateOpen(true)}>
              立即创建知识库
            </Button>
          </StageEmpty>
        )}
      </MainStage>

      {/* ── 3. 右侧精简资产管理抽屉 (340px，文件紧凑精致，无论多少文件都极其协调) ── */}
      <AssetsDrawer>
        <DrawerHeader>
          <div className="drawer-title">
            <Layers size={16} className="icon-primary" />
            <span>知识库文档 ({files.length})</span>
          </div>
          <div className="drawer-actions">
            <Dropdown menu={{ items: importMenuItems }} trigger={['click']}>
              <Button type="primary" size="small" icon={<Plus size={13} />} loading={busy}>
                导入 <ChevronDown size={11} />
              </Button>
            </Dropdown>
            <Tooltip title="刷新文件">
              <Button
                size="small"
                icon={<RefreshCw size={13} />}
                onClick={() => activeBase && void refreshFiles(activeBase.id)}
              />
            </Tooltip>
          </div>
        </DrawerHeader>

        {/* 统计指标小胶囊 */}
        <DrawerStatsBar>
          <div className="stat-item">
            <span className="label">就绪</span>
            <span className="val green">{readyCount}</span>
          </div>
          <div className="stat-v-divider" />
          <div className="stat-item">
            <span className="label">切块</span>
            <span className="val purple">{totalChunks}</span>
          </div>
          <div className="stat-v-divider" />
          <div className="stat-item">
            <span className="label">体积</span>
            <span className="val">{totalSizeKB} KB</span>
          </div>
        </DrawerStatsBar>

        {/* 搜索筛选 */}
        <DrawerSearch>
          <Input
            size="small"
            prefix={<Search size={13} style={{ color: 'var(--color-text-3)' }} />}
            placeholder="按文件名快速筛选..."
            value={fileFilter}
            onChange={(e) => setFileFilter(e.target.value)}
            allowClear
          />
        </DrawerSearch>

        {/* 文件列表 (紧凑型优雅卡片流) */}
        <DrawerFileList>
          {filteredFiles.length === 0 ? (
            <div className="drawer-empty">
              <FileText size={28} className="icon-muted" />
              <p>{fileFilter ? '无匹配文件' : '暂无文档，点击右上角「导入」添加'}</p>
            </div>
          ) : (
            filteredFiles.map((f) => {
              const meta = STATUS_CONFIG[f.status]
              return (
                <FileCompactCard key={f.id}>
                  <div className="card-top">
                    <div className="icon-wrap">{getFileIcon(f.name)}</div>
                    <div className="name-wrap">
                      <Tooltip title={f.name}>
                        <div className="file-name">{f.name}</div>
                      </Tooltip>
                      <div className="file-sub">{(f.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <Popconfirm
                      title="确定删除文档？"
                      description="将同步清理切块与向量索引"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void removeFile(f)}>
                      <button className="del-btn" title="删除文件">
                        <Trash2 size={13} />
                      </button>
                    </Popconfirm>
                  </div>
                  <div className="card-bottom">
                    <Tag color={meta.color} style={{ margin: 0, fontSize: 11, padding: '0 5px' }}>
                      {meta.label}
                    </Tag>
                    <span className="chunk-tag">
                      <Layers size={11} />
                      {f.chunk_count || 0} 块
                    </span>
                  </div>
                  {f.error_message && (
                    <div className="error-note" title={f.error_message}>
                      {f.error_message}
                    </div>
                  )}
                </FileCompactCard>
              )
            })
          )}
        </DrawerFileList>
      </AssetsDrawer>

      {/* ── 弹窗：新建知识库 ── */}
      <Modal
        title="新建知识库"
        open={createOpen}
        onOk={() => void createBase()}
        onCancel={() => {
          setCreateOpen(false)
          setKbName('')
          setKbModel(undefined)
          setKbRerankModel(undefined)
        }}
        okText="立即创建"
        cancelText="取消"
        destroyOnClose>
        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={16}>
          <div>
            <FieldLabel>知识库名称</FieldLabel>
            <Input
              placeholder="例如：公司产品手册 / 考研笔记 / 代码知识库"
              value={kbName}
              onChange={(e) => setKbName(e.target.value)}
              size="middle"
            />
          </div>
          <div>
            <FieldLabel>嵌入模型 (Embedding Model)</FieldLabel>
            <Select
              style={{ width: '100%' }}
              size="middle"
              placeholder={embeddingModels.length ? '选择向量模型' : '请先在「设置→模型服务」添加嵌入模型'}
              value={kbModel?.id ?? undefined}
              onChange={(id) => setKbModel(embeddingModels.find((m) => m.id === id))}
              options={embeddingModels.map((m) => ({ value: m.id, label: `${m.name} (${m.provider})` }))}
            />
            <FieldHint>💡 嵌入模型用于将文本切块转化为高维数学向量。创建后不可更改，以保证检索空间一致性。</FieldHint>
          </div>
          <div>
            <FieldLabel>重排模型 (Rerank Model)（可选）</FieldLabel>
            <Select
              style={{ width: '100%' }}
              size="middle"
              allowClear
              placeholder={rerankModels.length ? '暂不启用重排' : '未在「设置→模型服务」配置重排模型'}
              value={kbRerankModel?.id ?? undefined}
              onChange={(id) => setKbRerankModel(rerankModels.find((m) => m.id === id))}
              options={rerankModels.map((m) => ({ value: m.id, label: `${m.name} (${m.provider})` }))}
            />
            <FieldHint>
              ✨ 重排模型在检索后精排召回片段，提升 TopK
              相关性。它是运行时模型、不参与索引构建，创建后仍可在「设置」中随时更换。
            </FieldHint>
          </div>
        </Space>
      </Modal>

      {/* ── 弹窗：切块与召回参数 ── */}
      <Modal
        title="知识库向量与切块参数配置"
        open={settingsOpen}
        onOk={() => void saveSettings()}
        onCancel={() => setSettingsOpen(false)}
        okText="保存配置"
        cancelText="取消"
        destroyOnClose>
        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={16}>
          <div>
            <FieldLabel>切块大小 (Chunk Size / Token)</FieldLabel>
            <Select
              style={{ width: '100%' }}
              size="middle"
              value={chunkSize}
              onChange={setChunkSize}
              options={[
                { value: 256, label: '256 Tokens（短问答、精准FAQ）' },
                { value: 512, label: '512 Tokens（通用黄金平衡值，推荐）' },
                { value: 1024, label: '1024 Tokens（长文档、技术手册）' },
                { value: 2048, label: '2048 Tokens（超长篇幅/学术论文）' }
              ]}
            />
          </div>
          <div>
            <FieldLabel>切块重叠度 (Overlap / Token)</FieldLabel>
            <InputNumber
              min={0}
              max={1024}
              step={20}
              size="middle"
              style={{ width: '100%' }}
              value={chunkOverlap}
              onChange={(v) => setChunkOverlap(v ?? 0)}
            />
            <FieldHint>重叠区域能防止一段话刚好在切块边界被生硬截断（推荐 10%~20%）。</FieldHint>
          </div>
          <div>
            <FieldLabel>单次最大召回块数 (Top K)</FieldLabel>
            <Select
              style={{ width: '100%' }}
              size="middle"
              value={topK}
              onChange={setTopK}
              options={[
                { value: 3, label: 'Top 3（精简，省 Token）' },
                { value: 6, label: 'Top 6（标准推荐，召回充分）' },
                { value: 10, label: 'Top 10（全面，上下文足够时使用）' }
              ]}
            />
            <FieldHint>TopK 决定单次检索最终返回的片段数量（若有重排模型，则为重排后取前 TopK）。</FieldHint>
          </div>
          <div>
            <FieldLabel>重排模型 (Rerank Model)（可选，保存后即时生效）</FieldLabel>
            <Select
              style={{ width: '100%' }}
              size="middle"
              allowClear
              placeholder={
                rerankModels.length ? '不启用重排（默认 RRF 双路融合）' : '未在「设置→模型服务」配置重排模型'
              }
              value={rerankModel?.id ?? undefined}
              onChange={(id) => setRerankModel(rerankModels.find((m) => m.id === id))}
              options={rerankModels.map((m) => ({ value: m.id, label: `${m.name} (${m.provider})` }))}
            />
            <FieldHint>
              ✨
              重排模型用交叉编码对召回候选进行二次精排，可显著提升检索相关性。它是运行时模型，不参与索引构建，更换无需重新切块/向量化。
            </FieldHint>
          </div>
        </Space>
      </Modal>
    </PageLayout>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 现代三栏式自适应沉浸式工作台样式 (对调后：主调试沙箱居中，文件抽屉右置)
 * ───────────────────────────────────────────────────────────── */

const PageLayout = styled.div`
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-background);
  color: var(--color-text);
  overflow: hidden;
  box-sizing: border-box;
`

/* 1. 左栏：知识库列表 (240px) */
const Sidebar = styled.aside`
  width: 240px;
  min-width: 230px;
  height: 100%;
  background: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
`

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px;
  border-bottom: 1px solid var(--color-border);

  .title-group {
    display: flex;
    align-items: center;
    gap: 8px;

    h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text);
    }
  }

  .icon-primary {
    color: var(--color-primary);
  }
`

const SidebarList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const KbItemCard = styled.div<{ $active: boolean }>`
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--color-background)' : 'transparent')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-primary)' : 'transparent')};
  box-shadow: ${({ $active }) => ($active ? '0 2px 8px rgba(0, 0, 0, 0.05)' : 'none')};
  transition: all 0.2s ease;

  &:hover {
    background: var(--color-background);
    border-color: ${({ $active }) => ($active ? 'var(--color-primary)' : 'var(--color-border)')};
  }

  .kb-card-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .icon-active {
      color: var(--color-primary);
      flex-shrink: 0;
    }

    .icon-muted {
      color: var(--color-text-3);
      flex-shrink: 0;
    }

    .kb-title {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .del-btn {
      opacity: 0;
      background: none;
      border: none;
      color: var(--color-text-3);
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: all 0.15s ease;

      &:hover {
        color: var(--color-error);
        background: rgba(255, 77, 79, 0.1);
      }
    }
  }

  &:hover .del-btn {
    opacity: 1;
  }

  .kb-model-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: 11px;
    color: var(--color-text-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

/* 2. 中间核心主舞台 (Flex: 1 撑满屏幕) */
const MainStage = styled.main`
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
`

const HeaderBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;

    .title-section {
      display: flex;
      align-items: center;
      gap: 10px;

      h1 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text);
      }
    }

    .param-badges {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: var(--color-text-3);

      .param-item strong {
        color: var(--color-text);
      }
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
`

const SearchConsole = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background);

  .search-box-wrapper {
    background: var(--color-background-soft);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 12px;
    transition: border-color 0.2s ease;

    &:focus-within {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
    }

    .search-input {
      border: none;
      background: transparent;
      padding: 0;
      resize: none;
      box-shadow: none;
      font-size: 13px;

      &:focus {
        box-shadow: none;
      }
    }

    .search-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--color-border);

      .search-tips {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--color-text-3);

        .icon-sparkle {
          color: #fa8c16;
        }
      }
    }
  }
`

const RecallWorkspace = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  .workspace-loading {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
`

const WorkspaceEmpty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;

  .empty-box {
    max-width: 480px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;

    .empty-icon-circle {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: var(--color-background-soft);
      border: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }

    h3 {
      margin: 0 0 10px;
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text);
    }

    p {
      margin: 0 0 24px;
      font-size: 13px;
      color: var(--color-text-3);
      line-height: 1.65;
    }

    .quick-guide {
      width: 100%;
      background: var(--color-background-soft);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: left;

      .guide-item {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 12px;
        color: var(--color-text-2);

        .num {
          width: 18px;
          height: 18px;
          border-radius: 9px;
          background: var(--color-primary);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          flex-shrink: 0;
        }
      }
    }
  }
`

const ResultsSplit = styled.div`
  flex: 1;
  display: flex;
  height: 100%;
  overflow: hidden;
`

const HitsColumn = styled.div`
  width: 360px;
  min-width: 320px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  background: var(--color-background-soft);

  .hits-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);

    .hits-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text);
    }

    .hits-sub {
      font-size: 11px;
      color: var(--color-text-3);
    }
  }

  .hits-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
`

const HitCard = styled.div<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? 'var(--color-background)' : 'var(--color-background)')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-primary)' : 'var(--color-border)')};
  box-shadow: ${({ $active }) => ($active ? '0 2px 10px rgba(22, 119, 255, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)')};
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--color-primary);
  }

  .hit-card-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .rank-badge {
      font-size: 11px;
      font-weight: 700;
      color: var(--color-primary);
    }

    .file-name {
      flex: 1;
      font-size: 12px;
      font-weight: 500;
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .hit-preview {
    font-size: 12px;
    color: var(--color-text-2);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .hit-card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;

    .source-info {
      color: var(--color-text-3);
    }

    .view-link {
      color: var(--color-primary);
      font-weight: 500;
    }
  }
`

const ReadingPane = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  overflow: hidden;

  .reading-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-background);

    .meta-group {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .file-title-row {
        display: flex;
        align-items: center;
        gap: 8px;

        h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text);
        }
      }

      .source-row {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 12px;
        color: var(--color-text-3);

        .source-badge {
          background: var(--color-background-soft);
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid var(--color-border);
        }

        .score-badge strong {
          color: #52c41a;
        }
      }
    }
  }

  .reading-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;

    .text-content {
      margin: 0;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.8;
      color: var(--color-text);
      white-space: pre-wrap;
      word-break: break-word;
      user-select: text;
      background: var(--color-background-soft);
      padding: 18px 20px;
      border-radius: 8px;
      border: 1px solid var(--color-border);
    }
  }

  .no-selection {
    margin: auto;
    color: var(--color-text-3);
    font-size: 13px;
  }
`

const StageEmpty = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;

  .empty-icon {
    color: var(--color-primary);
    opacity: 0.8;
  }

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text);
  }

  p {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--color-text-3);
  }
`

/* 3. 右侧精简资产管理抽屉 (340px) */
const AssetsDrawer = styled.aside`
  width: 340px;
  min-width: 320px;
  height: 100%;
  background: var(--color-background-soft);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
`

const DrawerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);

  .drawer-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .icon-primary {
    color: var(--color-primary);
  }

  .drawer-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
`

const DrawerStatsBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 8px 10px;
  background: var(--color-background);
  border-bottom: 1px solid var(--color-border);

  .stat-item {
    display: flex;
    align-items: baseline;
    gap: 5px;

    .label {
      font-size: 11px;
      color: var(--color-text-3);
    }

    .val {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text);

      &.green {
        color: #52c41a;
      }

      &.purple {
        color: #722ed1;
      }
    }
  }

  .stat-v-divider {
    width: 1px;
    height: 12px;
    background: var(--color-border);
  }
`

const DrawerSearch = styled.div`
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-soft);
`

const DrawerFileList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .drawer-empty {
    margin: auto;
    text-align: center;
    padding: 30px 10px;
    color: var(--color-text-3);
    font-size: 12px;

    .icon-muted {
      opacity: 0.4;
      margin-bottom: 8px;
    }
  }
`

const FileCompactCard = styled.div`
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;

    .icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .name-wrap {
      flex: 1;
      min-width: 0;

      .file-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-sub {
        font-size: 10px;
        color: var(--color-text-3);
      }
    }

    .del-btn {
      opacity: 0.4;
      background: none;
      border: none;
      color: var(--color-text-3);
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      transition: all 0.15s ease;

      &:hover {
        opacity: 1;
        color: var(--color-error);
      }
    }
  }

  &:hover .del-btn {
    opacity: 0.8;
  }

  .card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .chunk-tag {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 11px;
      color: var(--color-text-3);
    }
  }

  .error-note {
    font-size: 10px;
    color: var(--color-error);
    background: rgba(255, 77, 79, 0.08);
    padding: 2px 4px;
    border-radius: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

/* 通用弹窗表单辅助 */
const EmptyBox = styled.div`
  margin-top: 30px;
`

const FieldLabel = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 6px;
`

const FieldHint = styled.div`
  font-size: 12px;
  color: var(--color-text-3);
  line-height: 1.5;
  margin-top: 6px;
`

export default KnowledgePage
