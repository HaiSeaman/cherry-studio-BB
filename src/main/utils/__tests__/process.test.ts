import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { findCommandInShellEnv } from '../process'

// Mock dependencies
vi.mock('child_process')
vi.mock('path')

/**
 * Helper to create a mock child process for spawn
 */
function createMockChildProcess() {
  const mockChild = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  mockChild.stdout = new EventEmitter()
  mockChild.stderr = new EventEmitter()
  mockChild.kill = vi.fn()
  return mockChild
}

describe('findCommandInShellEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset path.isAbsolute to real implementation for these tests
    vi.mocked(path.isAbsolute).mockImplementation((p) => p.startsWith('/') || /^[A-Z]:/i.test(p))
  })

  describe('command name validation', () => {
    it('should reject empty command name', async () => {
      const result = await findCommandInShellEnv('', {})
      expect(result).toBeNull()
      expect(spawn).not.toHaveBeenCalled()
    })

    it('should reject command names with shell metacharacters', async () => {
      const maliciousCommands = [
        'npx; rm -rf /',
        'npx && malicious',
        'npx | cat /etc/passwd',
        'npx`whoami`',
        '$(whoami)',
        'npx\nmalicious'
      ]

      for (const cmd of maliciousCommands) {
        const result = await findCommandInShellEnv(cmd, {})
        expect(result).toBeNull()
        expect(spawn).not.toHaveBeenCalled()
      }
    })

    it('should reject command names starting with hyphen', async () => {
      const result = await findCommandInShellEnv('-npx', {})
      expect(result).toBeNull()
      expect(spawn).not.toHaveBeenCalled()
    })

    it('should reject path traversal attempts', async () => {
      const pathTraversalCommands = ['../npx', '../../malicious', 'foo/bar', 'foo\\bar']

      for (const cmd of pathTraversalCommands) {
        const result = await findCommandInShellEnv(cmd, {})
        expect(result).toBeNull()
        expect(spawn).not.toHaveBeenCalled()
      }
    })

    it('should reject command names exceeding max length', async () => {
      const longCommand = 'a'.repeat(129)
      const result = await findCommandInShellEnv(longCommand, {})
      expect(result).toBeNull()
      expect(spawn).not.toHaveBeenCalled()
    })

    it('should accept valid command names', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      // Don't await - just start the call
      const resultPromise = findCommandInShellEnv('npx', { PATH: '/usr/bin' })

      // Simulate command not found
      mockChild.emit('close', 1)

      const result = await resultPromise
      expect(result).toBeNull()
      expect(spawn).toHaveBeenCalled()
    })

    it('should accept command names with underscores and hyphens', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('my_command-name', { PATH: '/usr/bin' })
      mockChild.emit('close', 1)

      await resultPromise
      expect(spawn).toHaveBeenCalled()
    })

    it('should accept command names at max length (128 chars)', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const maxLengthCommand = 'a'.repeat(128)
      const resultPromise = findCommandInShellEnv(maxLengthCommand, { PATH: '/usr/bin' })
      mockChild.emit('close', 1)

      await resultPromise
      expect(spawn).toHaveBeenCalled()
    })
  })

  describe.skipIf(process.platform === 'win32')('Unix/macOS behavior', () => {
    it('should find command and return absolute path', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('npx', { PATH: '/usr/bin' })

      // Simulate successful command -v output
      mockChild.stdout.emit('data', '/usr/local/bin/npx\n')
      mockChild.emit('close', 0)

      const result = await resultPromise
      expect(result).toBe('/usr/local/bin/npx')
      expect(spawn).toHaveBeenCalledWith('/bin/sh', ['-c', 'command -v "$1"', '--', 'npx'], expect.any(Object))
    })

    it('should return null for non-absolute paths (aliases/builtins)', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('cd', { PATH: '/usr/bin' })

      // Simulate builtin output (just command name)
      mockChild.stdout.emit('data', 'cd\n')
      mockChild.emit('close', 0)

      const result = await resultPromise
      expect(result).toBeNull()
    })

    it('should return null when command not found', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('nonexistent', { PATH: '/usr/bin' })

      // Simulate command not found (exit code 1)
      mockChild.emit('close', 1)

      const result = await resultPromise
      expect(result).toBeNull()
    })

    it('should handle spawn errors gracefully', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('npx', { PATH: '/usr/bin' })

      // Simulate spawn error
      mockChild.emit('error', new Error('spawn failed'))

      const result = await resultPromise
      expect(result).toBeNull()
    })

    it('should handle timeout gracefully', async () => {
      vi.useFakeTimers()
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('npx', { PATH: '/usr/bin' })

      // Fast-forward past timeout (5000ms)
      vi.advanceTimersByTime(6000)

      const result = await resultPromise
      expect(result).toBeNull()
      expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL')

      vi.useRealTimers()
    })
  })

  describe.skipIf(process.platform !== 'win32')('Windows behavior', () => {
    it('should find .exe files via where command', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('npx', { PATH: 'C:\\nodejs' })

      // Simulate where output
      mockChild.stdout.emit('data', 'C:\\Program Files\\nodejs\\npx.exe\r\n')
      mockChild.emit('close', 0)

      const result = await resultPromise
      expect(result).toBe('C:\\Program Files\\nodejs\\npx.exe')
      expect(spawn).toHaveBeenCalledWith('where', ['npx'], expect.any(Object))
    })

    it('should reject .cmd files on Windows', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('npx', { PATH: 'C:\\nodejs' })

      // Simulate where output with only .cmd file
      mockChild.stdout.emit('data', 'C:\\Program Files\\nodejs\\npx.cmd\r\n')
      mockChild.emit('close', 0)

      const result = await resultPromise
      expect(result).toBeNull()
    })

    it('should prefer .exe over .cmd when both exist', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('npx', { PATH: 'C:\\nodejs' })

      // Simulate where output with both .cmd and .exe
      mockChild.stdout.emit('data', 'C:\\Program Files\\nodejs\\npx.cmd\r\nC:\\Program Files\\nodejs\\npx.exe\r\n')
      mockChild.emit('close', 0)

      const result = await resultPromise
      expect(result).toBe('C:\\Program Files\\nodejs\\npx.exe')
    })

    it('should handle spawn errors gracefully', async () => {
      const mockChild = createMockChildProcess()
      vi.mocked(spawn).mockReturnValue(mockChild as never)

      const resultPromise = findCommandInShellEnv('npx', { PATH: 'C:\\nodejs' })

      // Simulate spawn error
      mockChild.emit('error', new Error('spawn failed'))

      const result = await resultPromise
      expect(result).toBeNull()
    })
  })
})
