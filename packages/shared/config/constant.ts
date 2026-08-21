import { codeLanguages } from './code-languages'

export const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
export const videoExts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv']
export const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac']
export const documentExts = ['.pdf', '.doc', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods']

/**
 * A flat array of all file extensions known by the linguist database.
 * This is the primary source for identifying code files.
 */
const linguistExtSet = new Set<string>()
for (const lang of Object.values(codeLanguages)) {
  if (lang.extensions) {
    for (const ext of lang.extensions) {
      linguistExtSet.add(ext)
    }
  }
}
export const codeLangExts = Array.from(linguistExtSet)

/**
 * A categorized map of custom text-based file extensions that are NOT included
 * in the linguist database. This is for special cases or project-specific files.
 */
export const customTextExts = new Map([
  [
    'language',
    [
      '.R', // R
      '.ets', // OpenHarmony,
      '.uniswap', // DeFi
      '.usf', // Unreal shader format
      '.ush' // Unreal shader header
    ]
  ],
  [
    'template',
    [
      '.vm' // Velocity
    ]
  ],
  [
    'config',
    [
      '.babelrc', // Babel
      '.bashrc',
      '.browserslistrc',
      '.conf',
      '.config', // 通用配置
      '.dockerignore', // Docker ignore
      '.eslintignore',
      '.eslintrc', // ESLint
      '.fishrc', // Fish shell配置
      '.htaccess', // Apache配置
      '.npmignore',
      '.npmrc', // npm
      '.prettierignore',
      '.prettierrc', // Prettier
      '.rc',
      '.robots', // robots.txt
      '.yarnrc',
      '.zshrc'
    ]
  ],
  [
    'document',
    [
      '.authors', // 作者文件
      '.changelog', // 变更日志
      '.license', // 许可证
      '.nfo', // 信息文件
      '.readme',
      '.text' // 纯文本
    ]
  ],
  [
    'data',
    [
      '.atom', // Feed格式
      '.ldif',
      '.map',
      '.ndjson' // 换行分隔JSON
    ]
  ],
  [
    'build',
    [
      '.bazel', // Bazel
      '.build', // Meson
      '.pom'
    ]
  ],
  [
    'database',
    [
      '.dml', // DDL/DML
      '.psql' // PostgreSQL
    ]
  ],
  [
    'web',
    [
      '.openapi', // API文档
      '.swagger'
    ]
  ],
  [
    'version',
    [
      '.bzrignore', // Bazaar ignore
      '.gitattributes', // Git attributes
      '.githistory', // Git history
      '.hgignore', // Mercurial ignore
      '.svnignore' // SVN ignore
    ]
  ],
  [
    'subtitle',
    [
      '.ass', // 字幕格式
      '.sub'
    ]
  ],
  [
    'log',
    [
      '.log',
      '.rpt' // 日志和报告 (移除了.out，因为通常是二进制可执行文件)
    ]
  ],
  [
    'eda',
    [
      '.cir',
      '.def', // LEF/DEF
      '.edif', // EDIF
      '.il',
      '.ils', // SKILL
      '.lef',
      '.net',
      '.scs', // Spectre
      '.sdf', // SDF
      '.spi'
    ]
  ]
])

/**
 * A comprehensive list of all text-based file extensions, combining the
 * extensive list from the linguist database with our custom additions.
 * The Set ensures there are no duplicates.
 */
export const textExts = [...new Set([...Array.from(customTextExts.values()).flat(), ...codeLangExts])]

export const ZOOM_SHORTCUTS = [
  {
    key: 'zoom_in',
    shortcut: ['CommandOrControl', '='],
    editable: false,
    enabled: true,
    system: true
  },
  {
    key: 'zoom_out',
    shortcut: ['CommandOrControl', '-'],
    editable: false,
    enabled: true,
    system: true
  },
  {
    key: 'zoom_reset',
    shortcut: ['CommandOrControl', '0'],
    editable: false,
    enabled: true,
    system: true
  }
]

/**
 * Complete default shortcut list shared by the main process (registration)
 * and the renderer (settings page). Add new shortcuts here, not in one place only.
 */
export const DEFAULT_SHORTCUTS = [
  ...ZOOM_SHORTCUTS,
  {
    key: 'show_settings',
    shortcut: ['CommandOrControl', ','],
    editable: false,
    enabled: true,
    system: true
  },
  {
    key: 'show_app',
    shortcut: [],
    editable: true,
    enabled: true,
    system: true
  },
  {
    key: 'mini_window',
    shortcut: ['CommandOrControl', 'E'],
    editable: true,
    enabled: false,
    system: true
  },
  {
    //enable/disable selection assistant
    key: 'selection_assistant_toggle',
    shortcut: [],
    editable: true,
    enabled: false,
    system: true
  },
  {
    //to select text with selection assistant
    key: 'selection_assistant_select_text',
    shortcut: [],
    editable: true,
    enabled: false,
    system: true
  },
  {
    //take a screenshot and send it to quick assistant
    key: 'screenshot',
    shortcut: ['Alt', 'Shift', 'A'],
    editable: true,
    enabled: true,
    system: true
  },
  {
    //toggle the desktop widget (music/notes/todos overlay window)
    key: 'desktop_widget',
    shortcut: ['Alt', '`'],
    editable: true,
    enabled: true,
    system: true
  },
  {
    key: 'new_topic',
    shortcut: ['CommandOrControl', 'N'],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'rename_topic',
    shortcut: ['CommandOrControl', 'T'],
    editable: true,
    enabled: false,
    system: false
  },
  {
    key: 'toggle_show_assistants',
    shortcut: ['CommandOrControl', '['],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'toggle_show_topics',
    shortcut: ['CommandOrControl', ']'],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'copy_last_message',
    shortcut: ['CommandOrControl', 'Shift', 'C'],
    editable: true,
    enabled: false,
    system: false
  },
  {
    key: 'edit_last_user_message',
    shortcut: ['CommandOrControl', 'Shift', 'E'],
    editable: true,
    enabled: false,
    system: false
  },
  {
    key: 'search_message_in_chat',
    shortcut: ['CommandOrControl', 'F'],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'search_message',
    shortcut: ['CommandOrControl', 'Shift', 'F'],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'clear_topic',
    shortcut: ['CommandOrControl', 'L'],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'toggle_new_context',
    shortcut: ['CommandOrControl', 'K'],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'select_model',
    shortcut: ['CommandOrControl', 'Shift', 'M'],
    editable: true,
    enabled: true,
    system: false
  },
  {
    key: 'exit_fullscreen',
    shortcut: ['Escape'],
    editable: false,
    enabled: true,
    system: true
  }
]

/**
 * Deduplicate and complete a shortcut list so it always contains exactly one
 * entry per default key:
 *
 * 1. keeps the FIRST occurrence of each key — legacy migrations pushed duplicate
 *    entries with push() without checking whether the key already existed
 *    (migrate 48/49/54/57/58/215), which left duplicated rows in persisted state;
 * 2. heals `system`/`editable` metadata back to the current defaults — they are
 *    NOT user-editable, and migrate 48 rewrote system=true for nearly everything;
 * 3. appends missing defaults (e.g. newly added "screenshot").
 *
 * User-editable fields (`shortcut`, `enabled`) are always preserved, and the
 * input list is never mutated.
 */
export const mergeDefaultShortcuts = <T extends { key: string; system: boolean; editable: boolean }>(
  shortcuts: T[]
): T[] => {
  const byDefault = new Map(DEFAULT_SHORTCUTS.map((d) => [d.key, d]))
  const merged: T[] = []
  const seen = new Set<string>()
  for (const s of shortcuts) {
    if (seen.has(s.key)) continue
    seen.add(s.key)
    const def = byDefault.get(s.key)
    if (def && (s.system !== def.system || s.editable !== def.editable)) {
      merged.push({ ...s, system: def.system, editable: def.editable })
    } else {
      merged.push(s)
    }
  }
  for (const def of DEFAULT_SHORTCUTS) {
    if (!seen.has(def.key)) {
      merged.push({ ...def } as unknown as T)
    }
  }
  return merged
}

export const KB = 1024
export const MB = 1024 * KB
export const GB = 1024 * MB
export const defaultLanguage = 'en-US'

export const DEFAULT_TIMEOUT = 30 * 1000 * 60

export const occupiedDirs = ['logs', 'Network', 'Partitions/webview/Network']

export const MIN_WINDOW_WIDTH = 960
export const SECOND_MIN_WINDOW_WIDTH = 520
export const MIN_WINDOW_HEIGHT = 600
export const defaultByPassRules = 'localhost,127.0.0.1,::1'

// resources/scripts should be maintained manually
export const HOME_CHERRY_DIR = '.cherrystudio'

export const APP_NAME = 'Cherry Studio'
