import type { NormalToolResponse } from '@renderer/types'
import { render, screen } from '@testing-library/react'
import { parse as parsePartialJson } from 'partial-json'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isValidAgentToolsType, MessageAgentTools } from '../MessageAgentTools'

vi.mock('@renderer/services/AssistantService', () => ({
  getDefaultAssistant: vi.fn(() => ({
    id: 'test-assistant',
    name: 'Test Assistant',
    settings: {}
  })),
  getDefaultTopic: vi.fn(() => ({
    id: 'test-topic',
    assistantId: 'test-assistant',
    createdAt: new Date().toISOString()
  }))
}))

// Mock dependencies
const mockUseAppSelector = vi.fn()

vi.mock('@renderer/store', () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
  useAppDispatch: () => vi.fn()
}))

vi.mock('@renderer/store/toolPermissions', () => ({
  selectPendingPermission: vi.fn()
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
}))

// Mock antd components
vi.mock('antd', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    Collapse: ({ items, defaultActiveKey, className }: any) => (
      <div data-testid="collapse" className={className} data-active-key={JSON.stringify(defaultActiveKey)}>
        {items?.map((item: any) => (
          <div key={item.key} data-testid={`collapse-item-${item.key}`}>
            <div data-testid={`collapse-header-${item.key}`}>{item.label}</div>
            <div data-testid={`collapse-content-${item.key}`}>{item.children}</div>
          </div>
        ))}
      </div>
    ),
    Spin: ({ size }: any) => <div data-testid="spin" data-size={size} />,
    Skeleton: {
      Input: ({ style }: any) => <span data-testid="skeleton-input" style={style} />
    },
    Tag: ({ children, className }: any) => (
      <span data-testid="tag" className={className}>
        {children}
      </span>
    ),
    Popover: ({ children }: any) => <>{children}</>,
    Card: ({ children, className }: any) => (
      <div data-testid="card" className={className}>
        {children}
      </div>
    ),
    Button: ({ children, onClick, type, size, icon, disabled }: any) => (
      <button
        type="button"
        data-testid="button"
        onClick={onClick}
        data-type={type}
        data-size={size}
        disabled={disabled}>
        {icon}
        {children}
      </button>
    )
  }
})

// Mock lucide-react icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    Loader2: ({ className }: any) => <span data-testid="loader-icon" className={className} />,
    FileText: () => <span data-testid="file-icon" />,
    Terminal: () => <span data-testid="terminal-icon" />,
    ListTodo: () => <span data-testid="list-icon" />,
    Circle: () => <span data-testid="circle-icon" />,
    CheckCircle: () => <span data-testid="check-circle-icon" />,
    Clock: () => <span data-testid="clock-icon" />,
    Check: () => <span data-testid="check-icon" />,
    TriangleAlert: () => <span data-testid="triangle-alert-icon" />,
    X: () => <span data-testid="x-icon" />,
    Wrench: () => <span data-testid="wrench-icon" />,
    ImageIcon: () => <span data-testid="image-icon" />
  }
})

// Mock CodeViewer (used by ReadTool/WriteTool, depends on useSettings and useCodeStyle)
vi.mock('@renderer/components/CodeViewer', () => ({
  default: ({ value }: any) => <pre data-testid="code-viewer">{value}</pre>
}))

// Mock LoadingIcon
vi.mock('@renderer/components/Icons', () => ({
  LoadingIcon: () => <span data-testid="loading-icon" />
}))

describe('MessageAgentTools', () => {
  beforeEach(() => {
    mockUseAppSelector.mockReturnValue(null) // No pending permission
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // Helper to create tool response
  const createToolResponse = (overrides: Partial<NormalToolResponse> = {}): NormalToolResponse => ({
    id: 'test-tool-1',
    tool: {
      id: 'Read',
      name: 'Read',
      description: '读取文件',
      type: 'provider'
    },
    arguments: undefined,
    status: 'pending',
    toolCallId: 'call-123',
    ...overrides
  })

  describe('isValidAgentToolsType', () => {
    it('should return true for valid tool types', () => {
      expect(isValidAgentToolsType('Read')).toBe(true)
      expect(isValidAgentToolsType('Bash')).toBe(true)
      expect(isValidAgentToolsType('PowerShell')).toBe(true)
    })

    it('should return false for invalid tool types', () => {
      expect(isValidAgentToolsType('InvalidTool')).toBe(false)
      expect(isValidAgentToolsType('')).toBe(false)
      expect(isValidAgentToolsType(null)).toBe(false)
      expect(isValidAgentToolsType(undefined)).toBe(false)
    })
  })

  describe('partial-json parsing', () => {
    it('should parse partial JSON correctly', () => {
      // Test partial-json library behavior
      const partialJson = '{"file_path": "/test.ts"'
      const parsed = parsePartialJson(partialJson)
      expect(parsed).toEqual({ file_path: '/test.ts' })
    })

    it('should parse nested partial JSON', () => {
      const partialJson = '{"todos": [{"content": "Task 1", "status": "pending"'
      const parsed = parsePartialJson(partialJson)
      expect(parsed).toEqual({
        todos: [{ content: 'Task 1', status: 'pending' }]
      })
    })

    it('should handle empty partial JSON', () => {
      const partialJson = '{'
      const parsed = parsePartialJson(partialJson)
      expect(parsed).toEqual({})
    })
  })

  describe('streaming tool rendering', () => {
    it('should render dedicated tool renderer with partial arguments during streaming', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'Read', name: 'Read', description: '读取文件', type: 'provider' },
        status: 'streaming',
        partialArguments: '{"file_path": "/test.ts"'
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      // Should render the DEDICATED ReadTool component, not StreamingToolContent
      // ReadTool uses '读取文件' as label, not just '读取文件'
      expect(screen.getByText('读取文件')).toBeInTheDocument()
      // Should show the filename from partial args
      expect(screen.getByText('test.ts')).toBeInTheDocument()
    })

    it('should pass parsed partial arguments to dedicated tool renderer', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'Read', name: 'Read', description: '读取文件', type: 'provider' },
        status: 'streaming',
        partialArguments: '{"file_path": "/path/to/myfile.ts", "offset": 10'
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      // Should use dedicated ReadTool renderer
      expect(screen.getByText('读取文件')).toBeInTheDocument()
      // Should show the filename extracted by ReadTool
      expect(screen.getByText('myfile.ts')).toBeInTheDocument()
    })

    it('should update dedicated renderer as more arguments stream in', () => {
      const initialResponse = createToolResponse({
        tool: { id: 'Read', name: 'Read', description: '读取文件', type: 'provider' },
        status: 'streaming',
        partialArguments: '{"file_path": "/test/partial'
      })

      const { rerender } = render(<MessageAgentTools toolResponse={initialResponse} />)

      // Should use dedicated renderer even with partial path
      expect(screen.getByText('读取文件')).toBeInTheDocument()

      // Update with status changed to pending when arguments complete
      const updatedResponse = createToolResponse({
        tool: { id: 'Read', name: 'Read', description: '读取文件', type: 'provider' },
        status: 'pending',
        partialArguments: '{"file_path": "/test/complete.ts", "limit": 100}'
      })

      rerender(<MessageAgentTools toolResponse={updatedResponse} />)

      // When pending with no permission, shows ToolStatusIndicator with loading icon
      expect(screen.getByTestId('loading-icon')).toBeInTheDocument()
    })
  })

  describe('completed tool rendering', () => {
    it('should render tool with full arguments when done', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'Read', name: 'Read', description: '读取文件', type: 'provider' },
        status: 'done',
        arguments: { file_path: '/test.ts', limit: 100 },
        response: 'file content here'
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      // Should render the complete tool with output
      expect(screen.getByText('读取文件')).toBeInTheDocument()
    })

    it('should render error state correctly', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'Read', name: 'Read', description: '读取文件', type: 'provider' },
        status: 'error',
        arguments: { file_path: '/nonexistent.ts' },
        response: 'File not found'
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      // Should still render the tool component
      expect(screen.getByText('读取文件')).toBeInTheDocument()
    })
  })

  describe('pending without streaming', () => {
    it('should show pending indicator when no streaming and no permission', () => {
      const toolResponse = createToolResponse({
        status: 'pending',
        partialArguments: undefined
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      // Should show the ToolStatusIndicator with loading icon
      expect(screen.getByTestId('loading-icon')).toBeInTheDocument()
    })
  })

  describe('Bash streaming', () => {
    it('should render Bash dedicated renderer with partial command during streaming', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'Bash', name: 'Bash', description: 'Execute command', type: 'provider' },
        status: 'streaming',
        partialArguments: '{"command": "npm install",'
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      // Should render the DEDICATED BashTool component
      expect(screen.getByText('执行命令')).toBeInTheDocument()
      // Command should be visible in the dedicated renderer (ANSI colorizer splits tokens across spans)
      const container = screen.getByTestId('collapse-content-Bash')
      expect(container.textContent).toContain('npm install')
    })

    it('should preserve Bash command, output, and truncation behavior', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'Bash', name: 'Bash', description: 'Execute command', type: 'provider' },
        status: 'done',
        arguments: { command: 'pnpm test', description: 'Run tests' },
        response: `${'x'.repeat(50000)}TAIL`
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      const container = screen.getByTestId('collapse-content-Bash')
      expect(container.textContent).toContain('pnpm test')
      expect(container.textContent).not.toContain('TAIL')
      expect(screen.getByText(/输出已截断（原始大小：/)).toBeInTheDocument()
    })
  })

  describe('PowerShell rendering', () => {
    it('should render the dedicated terminal card with command, output, label, and icon', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'PowerShell', name: 'PowerShell', description: '执行命令', type: 'provider' },
        status: 'done',
        arguments: { command: 'Get-ChildItem', description: 'List files' },
        response: 'Directory: C:\\workspace'
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      expect(screen.getByText('PowerShell')).toBeInTheDocument()
      expect(screen.getByTestId('terminal-icon')).toBeInTheDocument()
      const container = screen.getByTestId('collapse-content-PowerShell')
      expect(container.textContent).toContain('Get-ChildItem')
      expect(container.textContent).toContain('Directory: C:\\workspace')
    })
  })

  describe('unknown provider rendering', () => {
    it('should use the generic renderer for an unknown future provider tool', () => {
      const toolResponse = createToolResponse({
        tool: { id: 'FutureTool', name: 'FutureTool', description: 'Future provider tool', type: 'provider' },
        status: 'done',
        arguments: { query: 'future input' },
        response: 'future output'
      })

      render(<MessageAgentTools toolResponse={toolResponse} />)

      expect(screen.getByText('FutureTool')).toBeInTheDocument()
      expect(screen.getByTestId('wrench-icon')).toBeInTheDocument()
      expect(screen.getByText('future input')).toBeInTheDocument()
      expect(screen.getByText('future output')).toBeInTheDocument()
    })
  })
})
