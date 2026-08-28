// Find TS/TSX files that are never imported anywhere (dead file candidates)
// Usage: node scripts/find-dead-files.mjs [root]
import fs from 'fs'
import path from 'path'

const root = process.argv[2] || '.'
const SRC_DIRS = ['src', 'packages', 'scripts', 'tests']
const EXTS = ['.ts', '.tsx', '.mts', '.cts']

// collect all files
const allFiles = []
const htmlFiles = []
function walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'out' || e.name === 'dist' || e.name === 'build')
      continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (EXTS.includes(path.extname(e.name))) allFiles.push(p)
    else if (e.name.endsWith('.html')) htmlFiles.push(p)
  }
}
for (const d of SRC_DIRS) {
  const abs = path.join(root, d)
  if (fs.existsSync(abs)) walk(abs)
}
// root-level config/build files (depth 1)
for (const f of fs.readdirSync(root)) {
  const p = path.join(root, f)
  if (!fs.statSync(p).isFile()) continue
  if (EXTS.includes(path.extname(f)) || f.endsWith('.mjs') || f.endsWith('.cjs') || f.endsWith('.js')) {
    if (!f.startsWith('node_modules')) allFiles.push(p)
  }
}

// canonical module id per file: strip extension, keep relative to root, use forward slashes
const canonical = (f) => f.replace(/\\/g, '/').replace(/\.[^.]+$/, '')

const fileSet = new Map()
for (const f of allFiles) {
  const id = canonical(path.relative(root, f))
  fileSet.set(id, f)
  // also index without /index suffix and directory-style imports
  if (id.endsWith('/index')) fileSet.set(id.slice(0, -6), f)
}

// index dir-style imports: file imports '../../store' -> resolves to '../../store/index'
const resolutionVariants = new Set()
for (const f of allFiles) {
  const id = canonical(path.relative(root, f))
  resolutionVariants.add(id)
  resolutionVariants.add(id.slice(0, -6)) // strip /index
  if (id.endsWith('/index')) resolutionVariants.add(id.slice(0, -6))
}

const referenced = new Set()
const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+["'])(["'])([^"']+)\1/g
// side-effect imports: `import './x'` at line start (no binding, no from)
const sideEffectRe = /^\s*import\s+["']([^"']+)["']/gm

// resolve alias specifiers to project-relative ids
const ALIASES = [
  ['@renderer/', 'src/renderer/src/'],
  ['@main/', 'src/main/'],
  ['@shared/', 'packages/shared/'],
  ['@types/', 'src/renderer/src/types/'],
  ['@types', 'src/renderer/src/types/index'],
  ['@logger', '__LOGGER__'],
  ['@cherrystudio/ai-core/provider', 'packages/aiCore/src/core/providers/index'],
  ['@cherrystudio/ai-core/built-in/plugins', 'packages/aiCore/src/core/plugins/built-in/index'],
  ['@cherrystudio/ai-core/', 'packages/aiCore/src/'],
  ['@cherrystudio/ai-core', 'packages/aiCore/src/index']
]

for (const f of allFiles) {
  let content
  try {
    content = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  let m
  while ((m = importRe.exec(content)) !== null) {
    const spec = m[2]
    resolveSpec(spec, f)
  }
  // second pass: side-effect imports
  while ((m = sideEffectRe.exec(content)) !== null) {
    resolveSpec(m[1], f)
  }
}

function resolveSpec(spec, f) {
  if (spec.startsWith('.')) {
    const base = path.posix.dirname(canonical(path.relative(root, f)))
    const resolved = path.posix.normalize(path.posix.join(base, spec))
    if (resolutionVariants.has(resolved)) referenced.add(resolved)
    return
  }
  for (const [alias, target] of ALIASES) {
    if (spec === alias || spec.startsWith(alias)) {
      const resolved = path.posix.normalize(target + spec.slice(alias.length))
      if (resolutionVariants.has(resolved)) referenced.add(resolved)
    }
  }
}

// HTML entrypoints reference window entryPoint ts files (vite root = src/renderer)
for (const f of htmlFiles) {
  let content
  try {
    content = fs.readFileSync(f, 'utf8')
  } catch {
    continue
  }
  for (const match of content.matchAll(/src="([^"]+\.tsx?)"/g)) {
    let spec = match[1]
    const htmlDir = path.posix.dirname(canonical(path.relative(root, f)))
    let resolved
    if (spec.startsWith('/')) {
      // absolute /src/... from renderer root
      resolved = path.posix.normalize(path.posix.join(htmlDir, spec.replace(/^\//, '')))
    } else {
      resolved = path.posix.normalize(path.posix.join(htmlDir, spec))
    }
    resolved = resolved.replace(/\.[^.]+$/, '') // strip .ts/.tsx extension
    if (resolutionVariants.has(resolved)) referenced.add(resolved)
  }
}

// entry files / config-loaded files that legitimately have no importers
const ENTRY_WHITELIST = [
  '/main/index',
  '/preload/index',
  '/renderer/src/main',
  '/renderer/src/Router',
  '/renderer/src/App',
  '/renderer/src/index',
  '/renderer/src/i18n/index',
  '/renderer/src/i18n/locales/index',
  '/renderer/src/assets/',
  '/shared/index',
  '/aiCore/index',
  '/renderer/src/windows/',
  '/workers/',
  '/renderer/src/widgets/',
  '/renderer/src/automation/'
]

const dead = []
for (const [id, f] of fileSet) {
  const stripped = id.replace(/\/index$/, '')
  if (referenced.has(id) || referenced.has(stripped)) continue
  if (ENTRY_WHITELIST.some((w) => id.includes(w))) continue
  // exclude test files from "dead" claim (they're run by vitest)
  if (/__tests__|\.test\.|\.spec\.|tests\//.test(f)) continue
  dead.push({ id, file: f })
}

// de-dup by real file path
const seen = new Set()
dead.sort((a, b) => a.id.localeCompare(b.id))
for (const d of dead) {
  const real = path.resolve(root, d.file)
  if (seen.has(real)) continue
  seen.add(real)
  console.log(d.id)
}
console.error(`\n# ${seen.size} dead-file candidates (no importers found)`)
