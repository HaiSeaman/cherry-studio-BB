import { describe, expect, it } from 'vitest'

import migrate from '../migrate'

describe('store migrations', () => {
  describe('migration 207: StepFun Anthropic-compatible host backfill', () => {
    it('backfills anthropicApiHost for existing StepFun providers', async () => {
      const state = {
        llm: {
          providers: [
            {
              id: 'stepfun',
              apiHost: 'https://api.stepfun.com'
            }
          ]
        },
        _persist: { version: 206, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 207)

      expect(migrated.llm.providers[0].anthropicApiHost).toBe('https://api.stepfun.com')
    })

    it('preserves existing StepFun anthropicApiHost customizations', async () => {
      const state = {
        llm: {
          providers: [
            {
              id: 'stepfun',
              apiHost: 'https://api.stepfun.com',
              anthropicApiHost: 'https://custom.example.com'
            }
          ]
        },
        _persist: { version: 206, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 207)

      expect(migrated.llm.providers[0].anthropicApiHost).toBe('https://custom.example.com')
    })
  })

  describe('migration 209: remove removed features from sidebar', () => {
    it('removes openclaw and code_tools from sidebar icons', async () => {
      const state = {
        llm: {
          providers: []
        },
        settings: {
          sidebarIcons: {
            visible: ['assistants', 'openclaw', 'code_tools', 'knowledge'],
            disabled: ['openclaw']
          }
        },
        _persist: { version: 208, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 209)

      expect(migrated.settings.sidebarIcons.visible).toEqual(['assistants', 'knowledge'])
      expect(migrated.settings.sidebarIcons.disabled).toEqual([])
    })

    it('keeps sidebar intact when no removed icons present', async () => {
      const state = {
        llm: {
          providers: []
        },
        settings: {
          sidebarIcons: {
            visible: ['assistants', 'knowledge'],
            disabled: []
          }
        },
        _persist: { version: 208, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 209)

      expect(migrated.settings.sidebarIcons.visible).toEqual(['assistants', 'knowledge'])
      expect(migrated.settings.sidebarIcons.disabled).toEqual([])
    })
  })

  describe('migration 210: remove files page from sidebar', () => {
    it('removes files from sidebar icons', async () => {
      const state = {
        llm: {
          providers: []
        },
        settings: {
          sidebarIcons: {
            visible: ['assistants', 'files', 'knowledge'],
            disabled: ['files']
          }
        },
        _persist: { version: 209, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 210)

      expect(migrated.settings.sidebarIcons.visible).toEqual(['assistants', 'knowledge'])
      expect(migrated.settings.sidebarIcons.disabled).toEqual([])
    })

    it('keeps sidebar intact when files not present', async () => {
      const state = {
        llm: {
          providers: []
        },
        settings: {
          sidebarIcons: {
            visible: ['assistants', 'knowledge'],
            disabled: []
          }
        },
        _persist: { version: 209, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 210)

      expect(migrated.settings.sidebarIcons.visible).toEqual(['assistants', 'knowledge'])
      expect(migrated.settings.sidebarIcons.disabled).toEqual([])
    })
  })

  describe('migration 211: remove agents from sidebar', () => {
    it('removes agents from sidebar icons', async () => {
      const state = {
        llm: {
          providers: []
        },
        settings: {
          sidebarIcons: {
            visible: ['assistants', 'agents', 'knowledge'],
            disabled: ['agents']
          }
        },
        _persist: { version: 210, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 211)

      expect(migrated.settings.sidebarIcons.visible).toEqual(['assistants', 'knowledge'])
      expect(migrated.settings.sidebarIcons.disabled).toEqual([])
    })

    it('keeps sidebar intact when agents not present', async () => {
      const state = {
        llm: {
          providers: []
        },
        settings: {
          sidebarIcons: {
            visible: ['assistants', 'knowledge'],
            disabled: []
          }
        },
        _persist: { version: 210, rehydrated: false }
      }

      const migrated: any = await migrate(state as any, 211)

      expect(migrated.settings.sidebarIcons.visible).toEqual(['assistants', 'knowledge'])
      expect(migrated.settings.sidebarIcons.disabled).toEqual([])
    })
  })
})

describe('migration 216: sidebar normalization + theme backfill', () => {
  it('cleans dead icons, dedupes visible/disabled, normalizes to design order', async () => {
    const state = {
      llm: { providers: [] },
      settings: {
        sidebarIcons: {
          visible: ['knowledge', 'assistants', 'topics', 'music', 'notes', 'notes'],
          disabled: ['store', 'music']
        },
        theme: 'light'
      },
      _persist: { version: 215, rehydrated: false }
    }

    const migrated: any = await migrate(state as any, 216)

    expect(migrated.settings.sidebarIcons.visible).toEqual(['assistants', 'music', 'notes'])
    expect(migrated.settings.sidebarIcons.disabled).toEqual([])
  })

  it('backfills themeId: dark → slate (老用户深色主题不被切成浅色)', async () => {
    const state = {
      llm: { providers: [] },
      settings: { theme: 'dark' },
      _persist: { version: 215, rehydrated: false }
    }

    const migrated: any = await migrate(state as any, 216)

    expect(migrated.settings.themeId).toBe('slate')
  })

  it('keeps existing themeId untouched (1.1+ 用户已有 themeId)', async () => {
    const state = {
      llm: { providers: [] },
      settings: { theme: 'light', themeId: 'sky' },
      _persist: { version: 215, rehydrated: false }
    }

    const migrated: any = await migrate(state as any, 216)

    expect(migrated.settings.themeId).toBe('sky')
  })
})
