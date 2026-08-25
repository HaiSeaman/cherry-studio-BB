/**
 * @deprecated Scheduled for removal in v2.0.0
 * --------------------------------------------------------------------------
 * ⚠️ NOTICE: V2 DATA&UI REFACTORING (by 0xfullex)
 * --------------------------------------------------------------------------
 * STOP: Feature PRs affecting this file are currently BLOCKED.
 * Only critical bug fixes are accepted during this migration phase.
 *
 * This file is being refactored to v2 standards.
 * Any non-critical changes will conflict with the ongoing work.
 *
 * 🔗 Context & Status:
 * - Contribution Hold: https://github.com/CherryHQ/cherry-studio/issues/10954
 * - v2 Refactor PR   : https://github.com/CherryHQ/cherry-studio/pull/10162
 * --------------------------------------------------------------------------
 */
import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import { DEFAULT_STREAM_OPTIONS_INCLUDE_USAGE, isMac, LATEST_PRIVACY_POLICY_VERSION } from '@renderer/config/constant'
import { TRANSLATE_PROMPT } from '@renderer/config/prompts'
import { DEFAULT_SIDEBAR_ICONS } from '@renderer/config/sidebar'
import type { ThemeId } from '@renderer/config/themes'
import { getThemeMode } from '@renderer/config/themes'
import type {
  AssistantsSortType,
  CodeStyleVarious,
  LanguageVarious,
  MathEngine,
  MinAppRegionFilter,
  NotificationSource,
  OpenAIServiceTier,
  S3Config,
  SidebarIcon,
  TranslateLanguageCode
} from '@renderer/types'
import { ThemeMode } from '@renderer/types'
import type {
  OpenAICompletionsStreamOptions,
  OpenAIReasoningSummary,
  OpenAIVerbosity
} from '@renderer/types/aiCoreTypes'

export type SendMessageShortcut = 'Enter' | 'Shift+Enter' | 'Ctrl+Enter' | 'Command+Enter' | 'Alt+Enter'

/** 单个通知来源的开关与声音配置 */
export type NotificationSettingItem = {
  enabled: boolean
  /** 'default'=默认提示音；'custom:<filePath>'=本地音频文件路径 */
  sound: string
}

/** 通知设置：每个来源独立开关 + 自定义声音；老布尔数据经 migrate 升级为本结构 */
export type NotificationSettings = Record<NotificationSource, NotificationSettingItem>

/** 通知声音文件允许的扩展名（与闹钟自定义声音一致） */
export const NOTIFICATION_SOUND_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']

// Re-export for backward compatibility
export { DEFAULT_SIDEBAR_ICONS }

export type AssistantIconType = 'model' | 'emoji' | 'none'

export type UserTheme = {
  colorPrimary: string
  userFontFamily: string
  userCodeFontFamily: string
}

export interface SettingsState {
  showAssistants: boolean
  showTopics: boolean
  assistantsTabSortType: AssistantsSortType
  sendMessageShortcut: SendMessageShortcut
  language: LanguageVarious
  targetLanguage: TranslateLanguageCode
  proxyMode: 'system' | 'custom' | 'none'
  proxyUrl?: string
  proxyBypassRules?: string
  userName: string
  userId: string
  showPrompt: boolean
  showMessageDivider: boolean
  messageFont: 'system' | 'serif'
  showInputEstimatedTokens: boolean
  launchOnBoot: boolean
  launchToTray: boolean
  trayOnClose: boolean
  tray: boolean
  /** 桌面便签挂件：应用启动时自动显示 */
  stickyWidgetLaunchOnBoot: boolean
  /** 桌面音乐挂件：应用启动时自动显示 */
  musicWidgetLaunchOnBoot: boolean
  theme: ThemeMode
  /** 主题 ID（晨间绿洲/浅蓝晴空/…）；theme 字段兼容保留，实际以 themeId 为准 */
  themeId: ThemeId
  userTheme: UserTheme
  windowStyle: 'transparent' | 'opaque'
  fontSize: number
  topicPosition: 'left' | 'right'
  showTopicTime: boolean
  pinTopicsToTop: boolean
  assistantIconType: AssistantIconType
  pasteLongTextAsFile: boolean
  pasteLongTextThreshold: number
  clickAssistantToShowTopic: boolean
  renderInputMessageAsMarkdown: boolean
  codeEditor: {
    enabled: boolean
    themeLight: string
    themeDark: string
    highlightActiveLine: boolean
    foldGutter: boolean
    autocompletion: boolean
    keymap: boolean
  }
  /** @deprecated use codeViewer instead */
  codePreview: {
    themeLight: CodeStyleVarious
    themeDark: CodeStyleVarious
  }
  codeViewer: {
    themeLight: CodeStyleVarious
    themeDark: CodeStyleVarious
  }
  codeShowLineNumbers: boolean
  codeCollapsible: boolean
  codeWrappable: boolean
  codeImageTools: boolean
  codeFancyBlock: boolean
  mathEngine: MathEngine
  mathEnableSingleDollar: boolean
  messageStyle: 'plain' | 'bubble'
  foldDisplayMode: 'expanded' | 'compact'
  gridColumns: number
  gridPopoverTrigger: 'hover' | 'click'
  messageNavigation: 'none' | 'buttons' | 'anchor'
  // 数据目录设置
  skipBackupFile: boolean
  // webdav 配置 host, user, pass, path
  webdavHost: string
  webdavUser: string
  webdavPass: string
  webdavPath: string
  webdavAutoSync: boolean
  webdavSyncInterval: number
  webdavMaxBackups: number
  webdavSkipBackupFile: boolean
  webdavDisableStream: boolean
  webdavAllowSelfSignedCertificate: boolean
  translateModelPrompt: string
  autoTranslateWithSpace: boolean
  showTranslateConfirm: boolean
  enableTopicNaming: boolean
  customCss: string
  topicNamingPrompt: string
  // 消息操作确认设置
  confirmDeleteMessage: boolean
  confirmRegenerateMessage: boolean
  // Sidebar icons
  sidebarIcons: {
    visible: SidebarIcon[]
    disabled: SidebarIcon[]
  }
  // 图片生成自动保存路径（空表示未设置，使用默认 用户目录/图片/CherryStudio）
  imageSavePath: string
  narrowMode: boolean
  // QuickAssistant
  enableQuickAssistant: boolean
  clickTrayToShowQuickAssistant: boolean
  multiModelMessageStyle: MultiModelMessageStyle
  readClipboardAtStartup: boolean
  notionDatabaseID: string | null
  notionApiKey: string | null
  notionPageNameKey: string | null
  markdownExportPath: string | null
  forceDollarMathInMarkdown: boolean
  useTopicNamingForMessageTitle: boolean
  showModelNameInMarkdown: boolean
  showModelProviderInMarkdown: boolean
  thoughtAutoCollapse: boolean
  notionExportReasoning: boolean
  excludeCitationsInExport: boolean
  standardizeCitationsInExport: boolean
  yuqueToken: string | null
  yuqueUrl: string | null
  yuqueRepoId: string | null
  joplinToken: string | null
  joplinUrl: string | null
  joplinExportReasoning: boolean
  defaultObsidianVault: string | null
  /** This state is actaully default assistant preset */
  defaultAgent: string | null
  // 思源笔记配置
  siyuanApiUrl: string | null
  siyuanToken: string | null
  siyuanBoxId: string | null
  siyuanRootPath: string | null
  // 订阅的助手地址
  agentssubscribeUrl: string | null
  // MinApps
  maxKeepAliveMinapps: number
  showOpenedMinappsInSidebar: boolean
  minappsOpenLinkExternal: boolean
  /** Mini app region filter: 'auto' (detect from IP), 'CN', or 'Global' */
  minAppRegion: MinAppRegionFilter
  // 隐私设置
  privacyPolicyVersion?: string
  enableSpellCheck: boolean
  spellCheckLanguages: string[]
  enableQuickPanelTriggers: boolean
  // 硬件加速设置
  disableHardwareAcceleration: boolean
  // 使用系统标题栏 (仅Linux)
  useSystemTitleBar: boolean
  exportMenuOptions: {
    image: boolean
    markdown: boolean
    markdown_reason: boolean
    notion: boolean
    yuque: boolean
    joplin: boolean
    obsidian: boolean
    siyuan: boolean
    docx: boolean
    plain_text: boolean
    notes: boolean
  }
  // OpenAI
  openAI: {
    // TODO: it's a bad naming. rename it to reasoningSummary in v2.
    summaryText: OpenAIReasoningSummary
    /** @deprecated 现在该设置迁移到Provider对象中 */
    serviceTier: OpenAIServiceTier
    verbosity: OpenAIVerbosity
    streamOptions: {
      includeUsage: OpenAICompletionsStreamOptions['include_usage']
    }
  }
  // Notification
  notification: NotificationSettings
  // Local backup settings
  localBackupDir: string
  localBackupAutoSync: boolean
  localBackupSyncInterval: number
  localBackupMaxBackups: number
  localBackupSkipBackupFile: boolean
  s3: S3Config
  // Developer mode
  enableDeveloperMode: boolean
  // UI
  navbarPosition: 'left' | 'top'
  showMessageOutline: boolean
}

export type MultiModelMessageStyle = 'horizontal' | 'vertical' | 'fold' | 'grid'

export const initialState: SettingsState = {
  showAssistants: true,
  showTopics: true,
  assistantsTabSortType: 'list',
  sendMessageShortcut: 'Enter',
  language: navigator.language as LanguageVarious,
  targetLanguage: 'en-us',
  proxyMode: 'system',
  proxyUrl: undefined,
  proxyBypassRules: undefined,
  userName: '',
  userId: crypto.randomUUID(),
  showPrompt: true,
  showMessageDivider: true,
  messageFont: 'system',
  showInputEstimatedTokens: false,
  launchOnBoot: false,
  launchToTray: false,
  trayOnClose: true,
  tray: true,
  stickyWidgetLaunchOnBoot: false,
  musicWidgetLaunchOnBoot: false,
  theme: ThemeMode.system,
  themeId: 'oasis',
  userTheme: {
    colorPrimary: '#10b981',
    userFontFamily: '',
    userCodeFontFamily: ''
  },
  windowStyle: isMac ? 'transparent' : 'opaque',
  fontSize: 14,
  topicPosition: 'left',
  showTopicTime: false,
  pinTopicsToTop: false,
  assistantIconType: 'emoji',
  pasteLongTextAsFile: false,
  pasteLongTextThreshold: 1500,
  clickAssistantToShowTopic: true,
  renderInputMessageAsMarkdown: false,
  codeEditor: {
    enabled: false,
    themeLight: 'auto',
    themeDark: 'auto',
    highlightActiveLine: false,
    foldGutter: false,
    autocompletion: true,
    keymap: false
  },
  /** @deprecated use codeViewer instead */
  codePreview: {
    themeLight: 'auto',
    themeDark: 'auto'
  },
  codeViewer: {
    themeLight: 'auto',
    themeDark: 'auto'
  },
  codeShowLineNumbers: false,
  codeCollapsible: false,
  codeWrappable: false,
  codeImageTools: false,
  codeFancyBlock: true,
  mathEngine: 'KaTeX',
  mathEnableSingleDollar: true,
  messageStyle: 'plain',
  foldDisplayMode: 'expanded',
  gridColumns: 2,
  gridPopoverTrigger: 'click',
  messageNavigation: 'none',
  skipBackupFile: false,
  webdavHost: '',
  webdavUser: '',
  webdavPass: '',
  webdavPath: '/cherry-studio',
  webdavAutoSync: false,
  webdavSyncInterval: 0,
  webdavMaxBackups: 0,
  webdavSkipBackupFile: false,
  webdavDisableStream: false,
  webdavAllowSelfSignedCertificate: false,
  translateModelPrompt: TRANSLATE_PROMPT,
  autoTranslateWithSpace: false,
  showTranslateConfirm: true,
  enableTopicNaming: true,
  customCss: '',
  topicNamingPrompt: '',
  sidebarIcons: {
    visible: DEFAULT_SIDEBAR_ICONS,
    disabled: []
  },
  imageSavePath: '',
  narrowMode: false,
  enableQuickAssistant: false,
  clickTrayToShowQuickAssistant: false,
  readClipboardAtStartup: true,
  multiModelMessageStyle: 'horizontal',
  notionDatabaseID: '',
  notionApiKey: '',
  notionPageNameKey: 'Name',
  markdownExportPath: null,
  forceDollarMathInMarkdown: false,
  useTopicNamingForMessageTitle: false,
  showModelNameInMarkdown: false,
  showModelProviderInMarkdown: false,
  thoughtAutoCollapse: true,
  notionExportReasoning: false,
  excludeCitationsInExport: false,
  standardizeCitationsInExport: false,
  yuqueToken: '',
  yuqueUrl: '',
  yuqueRepoId: '',
  joplinToken: '',
  joplinUrl: '',
  joplinExportReasoning: false,
  defaultObsidianVault: null,
  defaultAgent: null,
  siyuanApiUrl: null,
  siyuanToken: null,
  siyuanBoxId: null,
  siyuanRootPath: null,
  agentssubscribeUrl: '',
  // MinApps
  maxKeepAliveMinapps: 3,
  showOpenedMinappsInSidebar: true,
  minappsOpenLinkExternal: false,
  minAppRegion: 'auto',
  privacyPolicyVersion: LATEST_PRIVACY_POLICY_VERSION,
  enableSpellCheck: false,
  spellCheckLanguages: [],
  enableQuickPanelTriggers: false,
  // 消息操作确认设置
  confirmDeleteMessage: true,
  confirmRegenerateMessage: true,
  // 硬件加速设置
  disableHardwareAcceleration: false,
  // 使用系统标题栏 (仅Linux)
  useSystemTitleBar: false,
  exportMenuOptions: {
    image: true,
    markdown: true,
    markdown_reason: true,
    notion: true,
    yuque: true,
    joplin: true,
    obsidian: true,
    siyuan: true,
    docx: true,
    plain_text: true,
    notes: true
  },
  // OpenAI
  openAI: {
    summaryText: 'auto',
    serviceTier: 'auto',
    verbosity: undefined,
    streamOptions: {
      includeUsage: DEFAULT_STREAM_OPTIONS_INCLUDE_USAGE
    }
  },
  notification: {
    assistant: { enabled: false, sound: 'default' },
    backup: { enabled: false, sound: 'default' },
    update: { enabled: false, sound: 'default' },
    automation: { enabled: true, sound: 'default' },
    paint: { enabled: false, sound: 'default' },
    video: { enabled: false, sound: 'default' }
  },
  // Local backup settings
  localBackupDir: '',
  localBackupAutoSync: false,
  localBackupSyncInterval: 0,
  localBackupMaxBackups: 0,
  localBackupSkipBackupFile: false,
  s3: {
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    root: '',
    autoSync: false,
    syncInterval: 0,
    maxBackups: 0,
    skipBackupFile: false
  },

  // Developer mode
  enableDeveloperMode: false,
  // UI
  navbarPosition: 'left',
  showMessageOutline: false
}

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setShowAssistants: (state, action: PayloadAction<boolean>) => {
      state.showAssistants = action.payload
    },
    toggleShowAssistants: (state) => {
      state.showAssistants = !state.showAssistants
    },
    setShowTopics: (state, action: PayloadAction<boolean>) => {
      state.showTopics = action.payload
    },
    toggleShowTopics: (state) => {
      state.showTopics = !state.showTopics
    },
    setAssistantsTabSortType: (state, action: PayloadAction<AssistantsSortType>) => {
      state.assistantsTabSortType = action.payload
    },
    setSendMessageShortcut: (state, action: PayloadAction<SendMessageShortcut>) => {
      state.sendMessageShortcut = action.payload
    },
    setLanguage: (state, action: PayloadAction<LanguageVarious>) => {
      state.language = action.payload
    },
    setTargetLanguage: (state, action: PayloadAction<TranslateLanguageCode>) => {
      state.targetLanguage = action.payload
    },
    setProxyMode: (state, action: PayloadAction<'system' | 'custom' | 'none'>) => {
      state.proxyMode = action.payload
    },
    setProxyUrl: (state, action: PayloadAction<string | undefined>) => {
      state.proxyUrl = action.payload
    },
    setProxyBypassRules: (state, action: PayloadAction<string | undefined>) => {
      state.proxyBypassRules = action.payload
    },
    setUserName: (state, action: PayloadAction<string>) => {
      state.userName = action.payload
    },
    setShowPrompt: (state, action: PayloadAction<boolean>) => {
      state.showPrompt = action.payload
    },
    setShowMessageDivider: (state, action: PayloadAction<boolean>) => {
      state.showMessageDivider = action.payload
    },
    setMessageFont: (state, action: PayloadAction<'system' | 'serif'>) => {
      state.messageFont = action.payload
    },
    setShowInputEstimatedTokens: (state, action: PayloadAction<boolean>) => {
      state.showInputEstimatedTokens = action.payload
    },
    setLaunchOnBoot: (state, action: PayloadAction<boolean>) => {
      state.launchOnBoot = action.payload
    },
    setLaunchToTray: (state, action: PayloadAction<boolean>) => {
      state.launchToTray = action.payload
    },
    setTray: (state, action: PayloadAction<boolean>) => {
      state.tray = action.payload
    },
    setTrayOnClose: (state, action: PayloadAction<boolean>) => {
      state.trayOnClose = action.payload
    },
    setStickyWidgetLaunchOnBoot: (state, action: PayloadAction<boolean>) => {
      state.stickyWidgetLaunchOnBoot = action.payload
    },
    setMusicWidgetLaunchOnBoot: (state, action: PayloadAction<boolean>) => {
      state.musicWidgetLaunchOnBoot = action.payload
    },
    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.theme = action.payload
    },
    setThemeId: (state, action: PayloadAction<ThemeId>) => {
      state.themeId = action.payload
      state.theme = getThemeMode(action.payload) === 'dark' ? ThemeMode.dark : ThemeMode.light
    },
    setCustomCss: (state, action: PayloadAction<string>) => {
      state.customCss = action.payload
    },
    setUserTheme: (state, action: PayloadAction<UserTheme>) => {
      state.userTheme = action.payload
    },
    setFontSize: (state, action: PayloadAction<number>) => {
      state.fontSize = action.payload
    },
    setWindowStyle: (state, action: PayloadAction<'transparent' | 'opaque'>) => {
      state.windowStyle = action.payload
    },
    setTopicPosition: (state, action: PayloadAction<'left' | 'right'>) => {
      state.topicPosition = action.payload
    },
    setShowTopicTime: (state, action: PayloadAction<boolean>) => {
      state.showTopicTime = action.payload
    },
    setPinTopicsToTop: (state, action: PayloadAction<boolean>) => {
      state.pinTopicsToTop = action.payload
    },
    setAssistantIconType: (state, action: PayloadAction<AssistantIconType>) => {
      state.assistantIconType = action.payload
    },
    setPasteLongTextAsFile: (state, action: PayloadAction<boolean>) => {
      state.pasteLongTextAsFile = action.payload
    },
    setRenderInputMessageAsMarkdown: (state, action: PayloadAction<boolean>) => {
      state.renderInputMessageAsMarkdown = action.payload
    },
    setClickAssistantToShowTopic: (state, action: PayloadAction<boolean>) => {
      state.clickAssistantToShowTopic = action.payload
    },
    setSkipBackupFile: (state, action: PayloadAction<boolean>) => {
      state.skipBackupFile = action.payload
    },
    setWebdavHost: (state, action: PayloadAction<string>) => {
      state.webdavHost = action.payload
    },
    setWebdavUser: (state, action: PayloadAction<string>) => {
      state.webdavUser = action.payload
    },
    setWebdavPass: (state, action: PayloadAction<string>) => {
      state.webdavPass = action.payload
    },
    setWebdavPath: (state, action: PayloadAction<string>) => {
      state.webdavPath = action.payload
    },
    setWebdavAutoSync: (state, action: PayloadAction<boolean>) => {
      state.webdavAutoSync = action.payload
    },
    setWebdavSyncInterval: (state, action: PayloadAction<number>) => {
      state.webdavSyncInterval = action.payload
    },
    setWebdavMaxBackups: (state, action: PayloadAction<number>) => {
      state.webdavMaxBackups = action.payload
    },
    setWebdavSkipBackupFile: (state, action: PayloadAction<boolean>) => {
      state.webdavSkipBackupFile = action.payload
    },
    setWebdavDisableStream: (state, action: PayloadAction<boolean>) => {
      state.webdavDisableStream = action.payload
    },
    setWebdavAllowSelfSignedCertificate: (state, action: PayloadAction<boolean>) => {
      state.webdavAllowSelfSignedCertificate = action.payload
    },
    setCodeEditor: (
      state,
      action: PayloadAction<{
        enabled?: boolean
        themeLight?: string
        themeDark?: string
        highlightActiveLine?: boolean
        foldGutter?: boolean
        autocompletion?: boolean
        keymap?: boolean
      }>
    ) => {
      if (action.payload.enabled !== undefined) {
        state.codeEditor.enabled = action.payload.enabled
      }
      if (action.payload.themeLight !== undefined) {
        state.codeEditor.themeLight = action.payload.themeLight
      }
      if (action.payload.themeDark !== undefined) {
        state.codeEditor.themeDark = action.payload.themeDark
      }
      if (action.payload.highlightActiveLine !== undefined) {
        state.codeEditor.highlightActiveLine = action.payload.highlightActiveLine
      }
      if (action.payload.foldGutter !== undefined) {
        state.codeEditor.foldGutter = action.payload.foldGutter
      }
      if (action.payload.autocompletion !== undefined) {
        state.codeEditor.autocompletion = action.payload.autocompletion
      }
      if (action.payload.keymap !== undefined) {
        state.codeEditor.keymap = action.payload.keymap
      }
    },
    setCodeViewer: (state, action: PayloadAction<{ themeLight?: string; themeDark?: string }>) => {
      if (action.payload.themeLight !== undefined) {
        state.codeViewer.themeLight = action.payload.themeLight
      }
      if (action.payload.themeDark !== undefined) {
        state.codeViewer.themeDark = action.payload.themeDark
      }
    },
    setCodeShowLineNumbers: (state, action: PayloadAction<boolean>) => {
      state.codeShowLineNumbers = action.payload
    },
    setCodeCollapsible: (state, action: PayloadAction<boolean>) => {
      state.codeCollapsible = action.payload
    },
    setCodeWrappable: (state, action: PayloadAction<boolean>) => {
      state.codeWrappable = action.payload
    },
    setCodeImageTools: (state, action: PayloadAction<boolean>) => {
      state.codeImageTools = action.payload
    },
    setCodeFancyBlock: (state, action: PayloadAction<boolean>) => {
      state.codeFancyBlock = action.payload
    },
    setMathEngine: (state, action: PayloadAction<MathEngine>) => {
      state.mathEngine = action.payload
    },
    setMathEnableSingleDollar: (state, action: PayloadAction<boolean>) => {
      state.mathEnableSingleDollar = action.payload
    },
    setFoldDisplayMode: (state, action: PayloadAction<'expanded' | 'compact'>) => {
      state.foldDisplayMode = action.payload
    },
    setGridColumns: (state, action: PayloadAction<number>) => {
      state.gridColumns = action.payload
    },
    setGridPopoverTrigger: (state, action: PayloadAction<'hover' | 'click'>) => {
      state.gridPopoverTrigger = action.payload
    },
    setMessageStyle: (state, action: PayloadAction<'plain' | 'bubble'>) => {
      state.messageStyle = action.payload
    },
    setTranslateModelPrompt: (state, action: PayloadAction<string>) => {
      state.translateModelPrompt = action.payload
    },
    setAutoTranslateWithSpace: (state, action: PayloadAction<boolean>) => {
      state.autoTranslateWithSpace = action.payload
    },
    setShowTranslateConfirm: (state, action: PayloadAction<boolean>) => {
      state.showTranslateConfirm = action.payload
    },
    setEnableTopicNaming: (state, action: PayloadAction<boolean>) => {
      state.enableTopicNaming = action.payload
    },
    setPasteLongTextThreshold: (state, action: PayloadAction<number>) => {
      state.pasteLongTextThreshold = action.payload
    },
    setTopicNamingPrompt: (state, action: PayloadAction<string>) => {
      state.topicNamingPrompt = action.payload
    },
    setSidebarIcons: (state, action: PayloadAction<{ visible?: SidebarIcon[]; disabled?: SidebarIcon[] }>) => {
      if (action.payload.visible) {
        state.sidebarIcons.visible = action.payload.visible
      }
      if (action.payload.disabled) {
        state.sidebarIcons.disabled = action.payload.disabled
      }
    },
    setNarrowMode: (state, action: PayloadAction<boolean>) => {
      state.narrowMode = action.payload
    },
    setClickTrayToShowQuickAssistant: (state, action: PayloadAction<boolean>) => {
      state.clickTrayToShowQuickAssistant = action.payload
    },
    setImageSavePath: (state, action: PayloadAction<string>) => {
      state.imageSavePath = action.payload
    },
    setEnableQuickAssistant: (state, action: PayloadAction<boolean>) => {
      state.enableQuickAssistant = action.payload
    },
    setReadClipboardAtStartup: (state, action: PayloadAction<boolean>) => {
      state.readClipboardAtStartup = action.payload
    },
    setMultiModelMessageStyle: (state, action: PayloadAction<'horizontal' | 'vertical' | 'fold' | 'grid'>) => {
      state.multiModelMessageStyle = action.payload
    },
    setNotionDatabaseID: (state, action: PayloadAction<string>) => {
      state.notionDatabaseID = action.payload
    },
    setNotionApiKey: (state, action: PayloadAction<string>) => {
      state.notionApiKey = action.payload
    },
    setNotionPageNameKey: (state, action: PayloadAction<string>) => {
      state.notionPageNameKey = action.payload
    },
    setmarkdownExportPath: (state, action: PayloadAction<string | null>) => {
      state.markdownExportPath = action.payload
    },
    setForceDollarMathInMarkdown: (state, action: PayloadAction<boolean>) => {
      state.forceDollarMathInMarkdown = action.payload
    },
    setUseTopicNamingForMessageTitle: (state, action: PayloadAction<boolean>) => {
      state.useTopicNamingForMessageTitle = action.payload
    },
    setShowModelNameInMarkdown: (state, action: PayloadAction<boolean>) => {
      state.showModelNameInMarkdown = action.payload
    },
    setShowModelProviderInMarkdown: (state, action: PayloadAction<boolean>) => {
      state.showModelProviderInMarkdown = action.payload
    },
    setThoughtAutoCollapse: (state, action: PayloadAction<boolean>) => {
      state.thoughtAutoCollapse = action.payload
    },
    setNotionExportReasoning: (state, action: PayloadAction<boolean>) => {
      state.notionExportReasoning = action.payload
    },
    setExcludeCitationsInExport: (state, action: PayloadAction<boolean>) => {
      state.excludeCitationsInExport = action.payload
    },
    setStandardizeCitationsInExport: (state, action: PayloadAction<boolean>) => {
      state.standardizeCitationsInExport = action.payload
    },
    setYuqueToken: (state, action: PayloadAction<string>) => {
      state.yuqueToken = action.payload
    },
    setYuqueRepoId: (state, action: PayloadAction<string>) => {
      state.yuqueRepoId = action.payload
    },
    setYuqueUrl: (state, action: PayloadAction<string>) => {
      state.yuqueUrl = action.payload
    },
    setJoplinToken: (state, action: PayloadAction<string>) => {
      state.joplinToken = action.payload
    },
    setJoplinUrl: (state, action: PayloadAction<string>) => {
      state.joplinUrl = action.payload
    },
    setJoplinExportReasoning: (state, action: PayloadAction<boolean>) => {
      state.joplinExportReasoning = action.payload
    },
    setMessageNavigation: (state, action: PayloadAction<'none' | 'buttons' | 'anchor'>) => {
      state.messageNavigation = action.payload
    },
    setDefaultObsidianVault: (state, action: PayloadAction<string>) => {
      state.defaultObsidianVault = action.payload
    },
    setDefaultAgent: (state, action: PayloadAction<string>) => {
      state.defaultAgent = action.payload
    },
    setSiyuanApiUrl: (state, action: PayloadAction<string>) => {
      state.siyuanApiUrl = action.payload
    },
    setSiyuanToken: (state, action: PayloadAction<string>) => {
      state.siyuanToken = action.payload
    },
    setSiyuanBoxId: (state, action: PayloadAction<string>) => {
      state.siyuanBoxId = action.payload
    },
    setSiyuanRootPath: (state, action: PayloadAction<string>) => {
      state.siyuanRootPath = action.payload
    },
    setAgentssubscribeUrl: (state, action: PayloadAction<string>) => {
      state.agentssubscribeUrl = action.payload
    },
    setMaxKeepAliveMinapps: (state, action: PayloadAction<number>) => {
      state.maxKeepAliveMinapps = action.payload
    },
    setShowOpenedMinappsInSidebar: (state, action: PayloadAction<boolean>) => {
      state.showOpenedMinappsInSidebar = action.payload
    },
    setMinappsOpenLinkExternal: (state, action: PayloadAction<boolean>) => {
      state.minappsOpenLinkExternal = action.payload
    },
    setMinAppRegion: (state, action: PayloadAction<MinAppRegionFilter>) => {
      state.minAppRegion = action.payload
    },
    setPrivacyPolicyVersion: (state, action: PayloadAction<string>) => {
      state.privacyPolicyVersion = action.payload
    },
    setEnableSpellCheck: (state, action: PayloadAction<boolean>) => {
      state.enableSpellCheck = action.payload
    },
    setSpellCheckLanguages: (state, action: PayloadAction<string[]>) => {
      state.spellCheckLanguages = action.payload
    },
    setExportMenuOptions: (state, action: PayloadAction<typeof initialState.exportMenuOptions>) => {
      state.exportMenuOptions = action.payload
    },
    setEnableQuickPanelTriggers: (state, action: PayloadAction<boolean>) => {
      state.enableQuickPanelTriggers = action.payload
    },
    setConfirmDeleteMessage: (state, action: PayloadAction<boolean>) => {
      state.confirmDeleteMessage = action.payload
    },
    setConfirmRegenerateMessage: (state, action: PayloadAction<boolean>) => {
      state.confirmRegenerateMessage = action.payload
    },
    setDisableHardwareAcceleration: (state, action: PayloadAction<boolean>) => {
      state.disableHardwareAcceleration = action.payload
    },
    setUseSystemTitleBar: (state, action: PayloadAction<boolean>) => {
      state.useSystemTitleBar = action.payload
    },
    setOpenAISummaryText: (state, action: PayloadAction<OpenAIReasoningSummary>) => {
      state.openAI.summaryText = action.payload
    },
    setOpenAIVerbosity: (state, action: PayloadAction<OpenAIVerbosity>) => {
      state.openAI.verbosity = action.payload
    },
    setOpenAIStreamOptionsIncludeUsage: (
      state,
      action: PayloadAction<OpenAICompletionsStreamOptions['include_usage']>
    ) => {
      state.openAI.streamOptions.includeUsage = action.payload
    },
    setNotificationSettings: (state, action: PayloadAction<SettingsState['notification']>) => {
      state.notification = action.payload
    },
    // Local backup settings
    setLocalBackupDir: (state, action: PayloadAction<string>) => {
      state.localBackupDir = action.payload
    },
    setLocalBackupAutoSync: (state, action: PayloadAction<boolean>) => {
      state.localBackupAutoSync = action.payload
    },
    setLocalBackupSyncInterval: (state, action: PayloadAction<number>) => {
      state.localBackupSyncInterval = action.payload
    },
    setLocalBackupMaxBackups: (state, action: PayloadAction<number>) => {
      state.localBackupMaxBackups = action.payload
    },
    setLocalBackupSkipBackupFile: (state, action: PayloadAction<boolean>) => {
      state.localBackupSkipBackupFile = action.payload
    },
    setS3: (state, action: PayloadAction<S3Config>) => {
      state.s3 = action.payload
    },
    setS3Partial: (state, action: PayloadAction<Partial<S3Config>>) => {
      state.s3 = { ...state.s3, ...action.payload }
    },
    setEnableDeveloperMode: (state, action: PayloadAction<boolean>) => {
      state.enableDeveloperMode = action.payload
    },
    setNavbarPosition: (state, action: PayloadAction<'left' | 'top'>) => {
      state.navbarPosition = action.payload
    },
    setShowMessageOutline: (state, action: PayloadAction<boolean>) => {
      state.showMessageOutline = action.payload
    }
  }
})

export const {
  setShowModelNameInMarkdown,
  setShowModelProviderInMarkdown,
  setShowAssistants,
  toggleShowAssistants,
  setShowTopics,
  toggleShowTopics,
  setAssistantsTabSortType,
  setSendMessageShortcut,
  setLanguage,
  setTargetLanguage,
  setProxyMode,
  setProxyUrl,
  setProxyBypassRules,
  setUserName,
  setShowPrompt,
  setShowMessageDivider,
  setMessageFont,
  setShowInputEstimatedTokens,
  setLaunchOnBoot,
  setLaunchToTray,
  setTrayOnClose,
  setTray,
  setStickyWidgetLaunchOnBoot,
  setMusicWidgetLaunchOnBoot,
  setTheme,
  setThemeId,
  setUserTheme,
  setFontSize,
  setWindowStyle,
  setTopicPosition,
  setShowTopicTime,
  setPinTopicsToTop,
  setAssistantIconType,
  setPasteLongTextAsFile,
  setRenderInputMessageAsMarkdown,
  setClickAssistantToShowTopic,
  setSkipBackupFile,
  setWebdavHost,
  setWebdavUser,
  setWebdavPass,
  setWebdavPath,
  setWebdavAutoSync,
  setWebdavSyncInterval,
  setWebdavMaxBackups,
  setWebdavSkipBackupFile,
  setWebdavDisableStream,
  setWebdavAllowSelfSignedCertificate,
  setCodeEditor,
  setCodeViewer,
  setCodeShowLineNumbers,
  setCodeCollapsible,
  setCodeWrappable,
  setCodeImageTools,
  setCodeFancyBlock,
  setMathEngine,
  setMathEnableSingleDollar,
  setFoldDisplayMode,
  setGridColumns,
  setGridPopoverTrigger,
  setMessageStyle,
  setTranslateModelPrompt,
  setAutoTranslateWithSpace,
  setShowTranslateConfirm,
  setEnableTopicNaming,
  setPasteLongTextThreshold,
  setCustomCss,
  setTopicNamingPrompt,
  setSidebarIcons,
  setNarrowMode,
  setClickTrayToShowQuickAssistant,
  setImageSavePath,
  setEnableQuickAssistant,
  setReadClipboardAtStartup,
  setMultiModelMessageStyle,
  setNotionDatabaseID,
  setNotionApiKey,
  setNotionPageNameKey,
  setmarkdownExportPath,
  setForceDollarMathInMarkdown,
  setUseTopicNamingForMessageTitle,
  setThoughtAutoCollapse,
  setNotionExportReasoning,
  setExcludeCitationsInExport,
  setStandardizeCitationsInExport,
  setYuqueToken,
  setYuqueRepoId,
  setYuqueUrl,
  setJoplinToken,
  setJoplinUrl,
  setJoplinExportReasoning,
  setMessageNavigation,
  setDefaultObsidianVault,
  setDefaultAgent,
  setSiyuanApiUrl,
  setSiyuanToken,
  setSiyuanBoxId,
  setAgentssubscribeUrl,
  setSiyuanRootPath,
  setMaxKeepAliveMinapps,
  setShowOpenedMinappsInSidebar,
  setMinappsOpenLinkExternal,
  setMinAppRegion,
  setPrivacyPolicyVersion,
  setEnableSpellCheck,
  setSpellCheckLanguages,
  setExportMenuOptions,
  setEnableQuickPanelTriggers,
  setConfirmDeleteMessage,
  setConfirmRegenerateMessage,
  setDisableHardwareAcceleration,
  setUseSystemTitleBar,
  setOpenAISummaryText,
  setOpenAIVerbosity,
  setOpenAIStreamOptionsIncludeUsage,
  setNotificationSettings,
  // Local backup settings
  setLocalBackupDir,
  setLocalBackupAutoSync,
  setLocalBackupSyncInterval,
  setLocalBackupMaxBackups,
  setLocalBackupSkipBackupFile,
  setS3,
  setS3Partial,
  setEnableDeveloperMode,
  setNavbarPosition,
  setShowMessageOutline
} = settingsSlice.actions

export default settingsSlice.reducer
