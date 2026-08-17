import { loggerService } from '@logger'
import { HOME_CHERRY_DIR } from '@shared/config/constant'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { isWin } from '../constant'
import { getResourcePath } from '.'

const logger = loggerService.withContext('Utils:Process')

export function runInstallScript(scriptPath: string, extraEnv?: Record<string, string>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const installScriptPath = path.join(getResourcePath(), 'scripts', scriptPath)
    logger.info(`Running script at: ${installScriptPath}`)

    const nodeProcess = spawn(process.execPath, [installScriptPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...extraEnv }
    })

    nodeProcess.stdout.on('data', (data) => {
      logger.debug(`Script output: ${data}`)
    })

    nodeProcess.stderr.on('data', (data) => {
      logger.error(`Script error: ${data}`)
    })

    nodeProcess.on('close', (code) => {
      if (code === 0) {
        logger.debug('Script completed successfully')
        resolve()
      } else {
        logger.warn(`Script exited with code ${code}`)
        reject(new Error(`Process exited with code ${code}`))
      }
    })
  })
}

export async function getBinaryName(name: string): Promise<string> {
  if (isWin) {
    return `${name}.exe`
  }
  return name
}

export async function getBinaryPath(name?: string): Promise<string> {
  if (!name) {
    return path.join(os.homedir(), HOME_CHERRY_DIR, 'bin')
  }

  const binaryName = await getBinaryName(name)
  const binariesDir = path.join(os.homedir(), HOME_CHERRY_DIR, 'bin')
  const binariesDirExists = fs.existsSync(binariesDir)
  return binariesDirExists ? path.join(binariesDir, binaryName) : binaryName
}

export async function isBinaryExists(name: string): Promise<boolean> {
  const cmd = await getBinaryPath(name)
  return fs.existsSync(cmd)
}

// Timeout for command lookup operations (in milliseconds)
const COMMAND_LOOKUP_TIMEOUT_MS = 5000

// Regex to validate command names - must start with alphanumeric or underscore, max 128 chars
const VALID_COMMAND_NAME_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,127}$/

// Maximum output size to prevent buffer overflow (10KB)
const MAX_OUTPUT_SIZE = 10240

/**
 * Check if a command is available in the user's login shell environment
 * @param command - Command name to check (e.g., 'npx', 'uvx')
 * @param loginShellEnv - The login shell environment from getLoginShellEnvironment()
 * @returns Full path to the command if found, null otherwise
 */
export async function findCommandInShellEnv(
  command: string,
  loginShellEnv: Record<string, string>
): Promise<string | null> {
  // Validate command name to prevent command injection
  if (!VALID_COMMAND_NAME_REGEX.test(command)) {
    logger.warn(`Invalid command name '${command}' - must only contain alphanumeric characters, underscore, or hyphen`)
    return null
  }

  return new Promise((resolve) => {
    let resolved = false

    const safeResolve = (value: string | null) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }

    if (isWin) {
      // On Windows, use 'where' command
      const child = spawn('where', [command], {
        env: loginShellEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let output = ''
      const timeoutId = setTimeout(() => {
        if (resolved) return
        child.kill('SIGKILL')
        logger.debug(`Timeout checking command '${command}' on Windows`)
        safeResolve(null)
      }, COMMAND_LOOKUP_TIMEOUT_MS)

      child.stdout.on('data', (data) => {
        if (output.length < MAX_OUTPUT_SIZE) {
          output += data.toString()
        }
      })

      child.on('close', (code) => {
        clearTimeout(timeoutId)
        if (resolved) return

        if (code === 0 && output.trim()) {
          const paths = output.trim().split(/\r?\n/)
          // Only accept .exe files on Windows - .cmd/.bat files cannot be executed
          // with spawn({ shell: false }) which is used by MCP SDK's StdioClientTransport
          const exePath = paths.find((p) => p.toLowerCase().endsWith('.exe'))
          if (exePath) {
            safeResolve(exePath)
          } else {
            logger.debug(`Command '${command}' found but not as .exe (${paths[0]}), treating as not found`)
            safeResolve(null)
          }
        } else {
          logger.debug(`Command '${command}' not found in shell environment`)
          safeResolve(null)
        }
      })

      child.on('error', (error) => {
        clearTimeout(timeoutId)
        if (resolved) return
        logger.warn(`Error checking command '${command}':`, { error, platform: 'windows' })
        safeResolve(null)
      })
    } else {
      // Unix/Linux/macOS: use 'command -v' which is POSIX standard
      // Use /bin/sh for reliability - it's POSIX compliant and always available
      // This avoids issues with user's custom shell (csh, fish, etc.)
      // SECURITY: Use positional parameter $1 to prevent command injection
      const child = spawn('/bin/sh', ['-c', 'command -v "$1"', '--', command], {
        env: loginShellEnv,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let output = ''
      const timeoutId = setTimeout(() => {
        if (resolved) return
        child.kill('SIGKILL')
        logger.debug(`Timeout checking command '${command}'`)
        safeResolve(null)
      }, COMMAND_LOOKUP_TIMEOUT_MS)

      child.stdout.on('data', (data) => {
        if (output.length < MAX_OUTPUT_SIZE) {
          output += data.toString()
        }
      })

      child.on('close', (code) => {
        clearTimeout(timeoutId)
        if (resolved) return

        if (code === 0 && output.trim()) {
          const commandPath = output.trim().split('\n')[0]

          // Validate the output is an absolute path (not an alias, function, or builtin)
          // command -v can return just the command name for aliases/builtins
          if (path.isAbsolute(commandPath)) {
            safeResolve(commandPath)
          } else {
            logger.debug(`Command '${command}' resolved to non-path '${commandPath}', treating as not found`)
            safeResolve(null)
          }
        } else {
          logger.debug(`Command '${command}' not found in shell environment`)
          safeResolve(null)
        }
      })

      child.on('error', (error) => {
        clearTimeout(timeoutId)
        if (resolved) return
        logger.warn(`Error checking command '${command}':`, { error, platform: 'unix' })
        safeResolve(null)
      })
    }
  })
}
