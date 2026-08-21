/**
 * @fileoverview Shared Anthropic AI client utilities for Cherry Studio
 *
 * This module builds Claude Code system messages shared by main and renderer
 * processes.
 */

import type { TextBlockParam } from '@anthropic-ai/sdk/resources'
import type { ModelMessage } from 'ai'

const defaultClaudeCodeSystemPrompt = `You are Claude Code, Anthropic's official CLI for Claude.`

const defaultClaudeCodeSystem: Array<TextBlockParam> = [
  {
    type: 'text',
    text: defaultClaudeCodeSystemPrompt
  }
]

/**
 * Builds and prepends the Claude Code system message to user-provided system messages.
 *
 * This function ensures that all interactions with Claude include the official Claude Code
 * system prompt, which identifies the assistant as "Claude Code, Anthropic's official CLI for Claude."
 *
 * The function handles three cases:
 * 1. No system message provided: Returns only the default Claude Code system message
 * 2. String system message: Converts to array format and prepends Claude Code message
 * 3. Array system message: Checks if Claude Code message exists and prepends if missing
 *
 * @param system - Optional user-provided system message (string or TextBlockParam array)
 * @returns Combined system message with Claude Code prompt prepended
 */
export function buildClaudeCodeSystemMessage(system?: string | Array<TextBlockParam>): Array<TextBlockParam> {
  if (!system) {
    return defaultClaudeCodeSystem
  }

  if (typeof system === 'string') {
    if (system.trim() === defaultClaudeCodeSystemPrompt || system.trim() === '') {
      return defaultClaudeCodeSystem
    } else {
      return [...defaultClaudeCodeSystem, { type: 'text', text: system }]
    }
  }
  if (Array.isArray(system)) {
    const firstSystem = system[0]
    if (firstSystem.type === 'text' && firstSystem.text.trim() === defaultClaudeCodeSystemPrompt) {
      return system
    } else {
      return [...defaultClaudeCodeSystem, ...system]
    }
  }

  return defaultClaudeCodeSystem
}

export function buildClaudeCodeSystemModelMessage(system?: string | Array<TextBlockParam>): Array<ModelMessage> {
  const textBlocks = buildClaudeCodeSystemMessage(system)
  return textBlocks.map((block) => ({
    role: 'system',
    content: block.text
  }))
}
