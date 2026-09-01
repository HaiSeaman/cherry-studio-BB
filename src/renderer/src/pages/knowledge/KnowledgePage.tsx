import { isEmbeddingModel } from '@renderer/config/models'
import { useProviders } from '@renderer/hooks/useProvider'
import type { Model } from '@renderer/types'
import {
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
  Tag,
  Tooltip
} from 'antd'
import { BookOpen, BookPlus, ChevronDown, Copy, FileText, FolderPlus, Search, Settings2, Trash2 } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

import { KnowledgeService } from './KnowledgeService'
import { searchKnowledge } from './search'
import type { KBFile, KBFileStatus, KBHit, KnowledgeBase } from './types'

const STATUS_META: Record<KBFileStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '待处理' },
  parsing: { color: 'processing', label: '解析中' },
  chunking: { color: 'processing', label: '切块中' },
  embedding: { color: 'processing', label: '向量化' },
  ready: { color: 'success', label: '就绪' },
  error: { color: 'error', label: '失败' }
}

/** 左侧导航固定宽；文件 20% / 对话查询 30% / 文件内容 50%（弹性可拖） */
const LEFT_PANEL_WIDTH = 220
const FILES_RATIO = 0.2
const QUERY_RATIO = 0.3
const FILES_PANEL_MIN = 200
const QUERY_PANEL_MIN = 300
const CONTENT_PANEL_MIN = 260

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max))

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

  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [activeBase, setActiveBase] = useState<KnowledgeBase | null>(null)
  const [files, setFiles] = useState<KBFile[]>([])
  const [busy, setBusy] = useState(false)

  // 建库弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [kbName, setKbName] = useState('')
  const [kbModel, setKbModel] = useState<Model | undefined>()

  // 对话查询（命中列表）
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<KBHit[]>([])
  const [searching, setSearching] = useState(false)

  // 文件内容（点击命中项后展示完整内容）
  const [selectedHit, setSelectedHit] = useState<KBHit | null>(null)

  // 设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chunkSize, setChunkSize] = useState(1024)
  const [chunkOverlap, setChunkOverlap] = useState(200)
  const [topK, setTopK] = useState(6)

  // 四栏宽度：文件 20% / 对话查询 30% / 文件内容 50%（窗口变化自动按比例重算，拖拽后锁定）
  const containerRef = useRef<HTMLDivElement>(null)
  const [filesWidth, setFilesWidth] = useState<number>(() =>
    Math.round((window.innerWidth - LEFT_PANEL_WIDTH - 26) * FILES_RATIO)
  )
  const [queryWidth, setQueryWidth] = useState<number>(() =>
    Math.round((window.innerWidth - LEFT_PANEL_WIDTH - 26) * QUERY_RATIO)
  )
  const filesWidthRef = useRef(filesWidth)
  const queryWidthRef = useRef(queryWidth)
  const hasDraggedRef = useRef(false)
  const dragRef = useRef<{ type: 'files' | 'query'; startX: number; startW: number } | null>(null)

  // 窗口大小变化（含最大化）时按 20/30/50 重算比例，除非用户已手动拖过
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (hasDraggedRef.current) return
      const avail = el.clientWidth - LEFT_PANEL_WIDTH - 26
      setFilesWidth(Math.round(avail * FILES_RATIO))
      setQueryWidth(Math.round(avail * QUERY_RATIO))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    filesWidthRef.current = filesWidth
  }, [filesWidth])
  useEffect(() => {
    queryWidthRef.current = queryWidth
  }, [queryWidth])

  const onDragStart = useCallback(
    (type: 'files' | 'query') => (e: React.MouseEvent) => {
      hasDraggedRef.current = true
      dragRef.current = {
        type,
        startX: e.clientX,
        startW: type === 'files' ? filesWidthRef.current : queryWidthRef.current
      }
      document.addEventListener('mousemove', onDragMove)
      document.addEventListener('mouseup', onDragEnd)
    },
    []
  )

  const onDragMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const avail = (containerRef.current?.clientWidth ?? window.innerWidth) - LEFT_PANEL_WIDTH - 26
    const dx = e.clientX - d.startX
    if (d.type === 'files') {
      const max = avail - QUERY_PANEL_MIN - CONTENT_PANEL_MIN
      setFilesWidth(clamp(d.startW + dx, FILES_PANEL_MIN, Math.max(FILES_PANEL_MIN, max)))
    } else {
      const max = avail - filesWidthRef.current - CONTENT_PANEL_MIN
      setQueryWidth(clamp(d.startW + dx, QUERY_PANEL_MIN, Math.max(QUERY_PANEL_MIN, max)))
    }
  }, [])

  const onDragEnd = useCallback(() => {
    dragRef.current = null
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
  }, [onDragMove])

  // 卸载时清理拖拽监听
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onDragMove)
      document.removeEventListener('mouseup', onDragEnd)
    }
  }, [onDragMove, onDragEnd])

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
    if (activeBase) void refreshFiles(activeBase.id)
  }, [activeBase, refreshFiles])

  const selectBase = (b: KnowledgeBase) => {
    setActiveBase(b)
    setHits([])
    setSelectedHit(null)
  }

  const createBase = async () => {
    if (!kbName.trim() || !kbModel) {
      message.warning('请填写知识库名称并选择嵌入模型')
      return
    }
    try {
      await KnowledgeService.createBase(kbName.trim(), kbModel)
      message.success('知识库创建成功')
      setKbName('')
      setKbModel(undefined)
      setCreateOpen(false)
      await refresh()
    } catch (error) {
      message.error(`创建失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 导入文件（系统对话框可多选） */
  const importFiles = async () => {
    if (!activeBase) return
    const files = await window.api.file.select({ properties: ['openFile', 'multiSelections'] })
    if (!files || files.length === 0) return
    setBusy(true)
    let added = 0
    let skipped = 0
    let failed = 0
    for (const f of files) {
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

  /** 导入整个文件夹 */
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
    setSettingsOpen(true)
  }

  const saveSettings = async () => {
    if (!activeBase) return
    await KnowledgeService.updateBaseSettings(activeBase.id, {
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap,
      top_k: topK
    })
    message.success('设置已保存（只影响之后新添加的内容）')
    setSettingsOpen(false)
    await refresh()
  }

  const copySelectedContent = async () => {
    if (!selectedHit) return
    try {
      await navigator.clipboard.writeText(selectedHit.chunk.text)
      window.toast?.success?.('已复制当前文件内容')
    } catch {
      message.error('复制失败，请手动选中复制')
    }
  }

  const readyCount = files.filter((f) => f.status === 'ready').length

  const importMenuItems = [
    { key: 'files', icon: <FileText size={14} />, label: '导入文件（可多选）', onClick: () => void importFiles() },
    { key: 'folder', icon: <FolderPlus size={14} />, label: '导入文件夹', onClick: () => void importFolder() }
  ]

  const sourceLabel = (h: KBHit): string => {
    const s = h.chunk.source
    if (s?.type === 'page') return `第 ${s.page ?? '?'} 页`
    if (s?.type === 'line') return `第 ${s.lineStart ?? '?'}-${s.lineEnd ?? '?'} 行`
    return `段落 ${s?.paraStart ?? '?'}-${s?.paraEnd ?? '?'}`
  }

  return (
    <Container ref={containerRef}>
      {/* ① 知识库列表（导航层，固定宽） */}
      <SidebarPanel>
        <SideTitle>
          <Space size={6}>
            <BookOpen size={15} />
            <span>知识库</span>
          </Space>
          <Button size="small" type="primary" icon={<BookPlus size={14} />} onClick={() => setCreateOpen(true)}>
            新建
          </Button>
        </SideTitle>
        {bases.length === 0 ? (
          <EmptyStyled description="还没有知识库" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <BaseList>
            {bases.map((b) => (
              <BaseItem key={b.id} $active={activeBase?.id === b.id} onClick={() => selectBase(b)}>
                <BaseName>{b.name}</BaseName>
                <BaseMeta>{b.embedding_model_id}</BaseMeta>
                <Popconfirm title="删除该知识库及全部文件？" onConfirm={() => void removeBase(b)}>
                  <TrashIcon />
                </Popconfirm>
              </BaseItem>
            ))}
          </BaseList>
        )}
      </SidebarPanel>

      {/* ② 文件列表（20% 弹性，可拖） */}
      <FilesPanel style={{ width: filesWidth }}>
        <PanelHeader>
          <Space size={6}>
            <FileText size={14} />
            <span>文件（{files.length}）</span>
          </Space>
          <Space size={4}>
            <Dropdown menu={{ items: importMenuItems }} trigger={['click']}>
              <Button size="small" loading={busy} disabled={!activeBase}>
                导入 <ChevronDown size={10} />
              </Button>
            </Dropdown>
            <Button size="small" icon={<Settings2 size={13} />} disabled={!activeBase} onClick={openSettings} />
          </Space>
        </PanelHeader>
        <PanelBody>
          {!activeBase || files.length === 0 ? (
            <EmptyStyled
              description={activeBase ? '点击右上角「导入」添加文件或文件夹' : '请先在左侧创建知识库'}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            files.map((f) => {
              const meta = STATUS_META[f.status]
              return (
                <FileRow key={f.id}>
                  <FileIcon>
                    <FileText size={14} />
                  </FileIcon>
                  <FileInfo>
                    <FileName>{f.name}</FileName>
                    <FileSub>
                      <span>{(f.size / 1024).toFixed(1)} KB</span>
                      <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
                        {meta.label}
                      </Tag>
                      {meta.label === '就绪' && <span>{f.chunk_count} 块</span>}
                    </FileSub>
                    {f.error_message && (
                      <Tooltip title={f.error_message}>
                        <FileError>失败后可删除重导</FileError>
                      </Tooltip>
                    )}
                  </FileInfo>
                  <Popconfirm title="删除该文件？" onConfirm={() => void removeFile(f)}>
                    <TrashIcon />
                  </Popconfirm>
                </FileRow>
              )
            })
          )}
        </PanelBody>
      </FilesPanel>

      <ResizeHandle onMouseDown={onDragStart('files')} title="拖拽调整宽度" />

      {/* ③ 对话查询（30% 弹性，可拖） */}
      <QueryPanel style={{ width: queryWidth }}>
        <PanelHeader>
          <Space size={6}>
            <Search size={14} />
            <span>对话查询</span>
          </Space>
          {activeBase && (
            <Tag>
              就绪 {readyCount}/{files.length}
            </Tag>
          )}
        </PanelHeader>
        <PanelBody>
          <SearchBar>
            <Input
              placeholder="输入问题，检索知识库（召回测试）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={() => void doSearch()}
              prefix={<Search size={13} />}
              allowClear
              disabled={!activeBase}
            />
            <Button type="primary" loading={searching} onClick={() => void doSearch()} disabled={!activeBase}>
              查询
            </Button>
          </SearchBar>
          {hits.length === 0 ? (
            <EmptyStyled
              description="查询结果将显示在这里，点击某条可在右侧查看完整内容"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <HitList>
              {hits.map((h, i) => (
                <HitItem
                  key={h.chunk.id}
                  $active={selectedHit?.chunk.id === h.chunk.id}
                  onClick={() => setSelectedHit(h)}>
                  <HitHeader>
                    <HitRank>{i + 1}</HitRank>
                    <span>{h.file.name}</span>
                    <Tag color="blue">匹配 {(h.score * 100).toFixed(1)}</Tag>
                  </HitHeader>
                  <HitText>{h.chunk.text}</HitText>
                </HitItem>
              ))}
            </HitList>
          )}
        </PanelBody>
      </QueryPanel>

      <ResizeHandle onMouseDown={onDragStart('query')} title="拖拽调整宽度" />

      {/* ④ 文件内容（50% 弹性，阅读层最宽） */}
      <ContentPanel>
        <PanelHeader>
          <Space size={6}>
            <FileText size={14} />
            <span>文件内容</span>
          </Space>
          <Space size={8}>
            {selectedHit && <Tag color="blue">{sourceLabel(selectedHit)}</Tag>}
            <Button
              size="small"
              icon={<Copy size={13} />}
              disabled={!selectedHit}
              onClick={() => void copySelectedContent()}>
              复制
            </Button>
          </Space>
        </PanelHeader>
        <PanelBody>
          {!selectedHit ? (
            <EmptyStyled
              description="点击左侧查询结果，这里显示完整原文，可选中复制"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <ContentWrap>
              <ContentMeta>
                <strong>{selectedHit.file.name}</strong>
                <span>
                  来源 {sourceLabel(selectedHit)} · 匹配 {(selectedHit.score * 100).toFixed(1)}
                </span>
              </ContentMeta>
              <ContentText>{selectedHit.chunk.text}</ContentText>
            </ContentWrap>
          )}
        </PanelBody>
      </ContentPanel>

      {/* 建库弹窗 */}
      <Modal
        title="新建知识库"
        open={createOpen}
        onOk={() => void createBase()}
        onCancel={() => setCreateOpen(false)}
        okText="创建"
        cancelText="取消"
        destroyOnClose>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="知识库名称（如：产品手册）" value={kbName} onChange={(e) => setKbName(e.target.value)} />
          <div>
            <Label>嵌入模型（建库后锁定，检索须用同一模型）</Label>
            <Select
              style={{ width: '100%' }}
              placeholder={embeddingModels.length ? '选择向量模型' : '请先在「设置→模型服务」添加嵌入模型'}
              value={kbModel?.id ?? undefined}
              onChange={(id) => setKbModel(embeddingModels.find((m) => m.id === id))}
              options={embeddingModels.map((m) => ({ value: m.id, label: `${m.name}（${m.provider}）` }))}
            />
            <PrivacyNote>
              不设置参数时，将按所选模型的推荐默认（如 bge 系 512 切块、qwen 系 1024
              切块）；若为云端模型，文件内容将发送至服务商，敏感资料请用本地模型。
            </PrivacyNote>
          </div>
        </Space>
      </Modal>

      {/* 设置弹窗 */}
      <Modal
        title="知识库设置"
        open={settingsOpen}
        onOk={() => void saveSettings()}
        onCancel={() => setSettingsOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose>
        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          <div>
            <Label>切块大小（token）</Label>
            <Select
              style={{ width: '100%' }}
              value={chunkSize}
              onChange={setChunkSize}
              options={[
                { value: 256, label: '256（短文档/FAQ，精确）' },
                { value: 512, label: '512（通用推荐）' },
                { value: 1024, label: '1024（长文档）' },
                { value: 2048, label: '2048（超长文档，检索易降精度）' }
              ]}
            />
          </div>
          <div>
            <Label>重叠（token，建议为切块大小的 10%~20%）</Label>
            <InputNumber min={0} max={1024} step={10} value={chunkOverlap} onChange={(v) => setChunkOverlap(v ?? 0)} />
          </div>
          <div>
            <Label>每次引用块数（TopK）</Label>
            <Select
              style={{ width: '100%' }}
              value={topK}
              onChange={setTopK}
              options={[
                { value: 3, label: '3（精简）' },
                { value: 4, label: '4' },
                { value: 6, label: '6（默认）' },
                { value: 8, label: '8' },
                { value: 10, label: '10（全面）' }
              ]}
            />
          </div>
          <PrivacyNote>切块与重叠只影响之后新添加的内容；建议每次只改一个参数并用同一组问题复测。</PrivacyNote>
        </Space>
      </Modal>
    </Container>
  )
}

/* ─────────── 布局与样式（8px 间距基线 / 12px 圆角 / 卡片层次） ─────────── */

const Container = styled.div`
  display: flex;
  gap: 8px;
  height: 100%;
  padding: 12px;
  background: var(--color-background);
`

const PanelBase = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
`

const SidebarPanel = styled(PanelBase)`
  width: ${LEFT_PANEL_WIDTH}px;
  min-width: ${LEFT_PANEL_WIDTH}px;
  padding: 10px;
`

const FilesPanel = styled(PanelBase)``

const QueryPanel = styled(PanelBase)``

/** 阅读层：更“纸感”的背景与更宽的呼吸感，突出主内容 */
const ContentPanel = styled(PanelBase)`
  flex: 1;
  min-width: ${CONTENT_PANEL_MIN}px;
  background: var(--color-background);
`

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-2);
`

const PanelBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px;
`

const SideTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 10px;
`

const BaseList = styled.div``

const BaseItem = styled.div<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 8px;
  cursor: pointer;
  background: ${({ $active }) => ($active ? 'var(--color-background)' : 'transparent')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-primary)' : 'transparent')};
  position: relative;

  &:hover {
    background: var(--color-background);
  }
`

const BaseName = styled.span`
  font-weight: 500;
  padding-right: 22px;
`

const BaseMeta = styled.span`
  font-size: 12px;
  color: var(--color-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const FileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border-bottom: 1px solid var(--color-border);

  &:hover {
    background: var(--color-background);
  }
`

const FileIcon = styled.span`
  display: inline-flex;
  color: var(--color-text-3);
`

const FileInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const FileName = styled.div`
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const FileSub = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-3);
`

const FileError = styled.span`
  font-size: 12px;
  color: var(--color-error);
`

const SearchBar = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`

const HitList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const HitItem = styled.div<{ $active: boolean }>`
  border: 1px solid ${({ $active }) => ($active ? 'var(--color-primary)' : 'var(--color-border)')};
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;

  &:hover {
    background: var(--color-background);
  }
`

const HitHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 4px;
`

const HitRank = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
`

const HitText = styled.div`
  font-size: 13px;
  color: var(--color-text-2);
  max-height: 64px;
  overflow: hidden;
`

const ContentWrap = styled.div``

const ContentMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--color-text-3);
`

/** 阅读正文：可选中复制，保留换行，行高舒适 */
const ContentText = styled.div`
  font-size: 14px;
  line-height: 1.75;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  padding: 0 4px 12px;
`

const ResizeHandle = styled.div`
  width: 6px;
  margin: 0 -1px;
  cursor: col-resize;
  border-radius: 3px;
  display: flex;
  align-items: stretch;
  justify-content: center;

  &::before {
    content: '';
    width: 2px;
    height: 100%;
    border-radius: 1px;
    background: transparent;
    transition: background 0.15s ease;
  }

  &:hover::before {
    background: var(--color-primary);
    opacity: 0.6;
  }
`

const TrashIcon = styled(Trash2)`
  width: 15px;
  height: 15px;
  color: var(--color-text-3);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: var(--color-error);
  }
`

const Label = styled.div`
  margin-bottom: 6px;
  color: var(--color-text-2);
  font-size: 13px;
`

const PrivacyNote = styled.div`
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-3);
`

const EmptyStyled = styled(Empty)`
  margin-top: 40px;
`

export default KnowledgePage
