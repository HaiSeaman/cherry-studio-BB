const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')
process.chdir(rootDir)

const isDryRun = process.argv.includes('--dry-run')

console.log('============================================================')
console.log(' Cherry Studio Dev Launcher')
console.log('============================================================\n')

if (process.env.ELECTRON_RUN_AS_NODE) {
  console.log('[*] Cleaning ELECTRON_RUN_AS_NODE environment variable...')
  delete process.env.ELECTRON_RUN_AS_NODE
}

function findPackageManager() {
  const isWin = process.platform === 'win32'
  const candidates = isWin
    ? ['pnpm.cmd', 'pnpm', path.join(process.env.APPDATA || '', 'npm', 'pnpm.cmd'), 'npx.cmd', 'npx']
    : ['pnpm', 'npx']

  for (const cmd of candidates) {
    try {
      const checkCmd = cmd.includes('npx') ? `${cmd} pnpm -v` : `${cmd} -v`
      const version = execSync(checkCmd, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
      if (version) {
        return {
          cmd: cmd,
          args: cmd.includes('npx') ? ['pnpm', 'run', 'dev'] : ['run', 'dev'],
          name: cmd,
          version: version
        }
      }
    } catch {
      // Continue
    }
  }
  return null
}

console.log('[1/3] Checking Node.js runtime and package manager...')
console.log(`      Node.js: ${process.version}`)

const pm = findPackageManager()
if (!pm) {
  console.error('\n[ERROR] Could not locate pnpm or npx in your environment.')
  console.error('Please install pnpm globally via: npm install -g pnpm')
  process.exit(1)
}
console.log(`      Package manager: ${pm.name} (${pm.version})`)

console.log('\n[2/3] Checking dependencies...')
const hasModules = fs.existsSync(path.join(rootDir, 'node_modules'))
if (!hasModules) {
  console.log('      First run detected. Installing dependencies...')
  try {
    const installArgs = pm.name.includes('npx') ? ['pnpm', 'install'] : ['install']
    execSync(`${pm.cmd} ${installArgs.join(' ')}`, { stdio: 'inherit' })
  } catch {
    console.error('\n[ERROR] Failed to install dependencies.')
    process.exit(1)
  }
} else {
  console.log('      Dependencies are ready.')
}

console.log('\n[3/3] Ready to launch.')
if (isDryRun) {
  console.log('[DRY RUN] All pre-launch checks passed successfully.')
  process.exit(0)
}

console.log('Starting Cherry Studio in development mode...\n')

const childEnv = Object.assign({}, process.env)
delete childEnv.ELECTRON_RUN_AS_NODE

const child = spawn(pm.cmd, pm.args, {
  cwd: rootDir,
  env: childEnv,
  stdio: 'inherit',
  shell: true
})

child.on('error', (err) => {
  console.error('[ERROR] Failed to start process:', err.message)
  process.exit(1)
})

child.on('close', (code) => {
  process.exit(code || 0)
})
