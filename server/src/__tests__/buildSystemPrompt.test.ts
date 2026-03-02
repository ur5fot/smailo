import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, type AppContext } from '../services/aiService.js'

describe('buildSystemPrompt', () => {
  describe('brainstorm phase', () => {
    it('returns brainstorm prompt without app context', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('You are Smailo')
      expect(prompt).toContain('brainstorm')
      expect(prompt).not.toContain('APP CONTEXT')
    })

    it('includes dataSource documentation in brainstorm prompt', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('dataSource')
      expect(prompt).toContain('"type": "table"')
      expect(prompt).toContain('"tableId"')
    })

    it('includes dataSource examples for DataTable, Form, Chart, CardList', () => {
      const prompt = buildSystemPrompt('brainstorm')
      // DataTable with dataSource
      expect(prompt).toContain('DataTable')
      expect(prompt).toMatch(/DataTable.*dataSource/s)
      // Form with dataSource
      expect(prompt).toMatch(/Form.*dataSource.*table/s)
      // Chart with dataSource
      expect(prompt).toMatch(/Chart.*dataSource/s)
      // CardList with dataSource
      expect(prompt).toMatch(/CardList.*dataSource/s)
    })

    it('explains when to use dataSource vs dataKey', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('WHEN TO USE dataSource vs dataKey')
      expect(prompt).toContain('structured lists')
      expect(prompt).toContain('single values')
    })

    it('does not mention "coming in a future update" for tables', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).not.toContain('coming in a future update')
    })
  })

  describe('chat phase without app context', () => {
    it('returns in-app prompt without app context section', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('already-created app')
      expect(prompt).not.toContain('APP CONTEXT')
    })

    it('includes dataSource in component guide', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('dataSource')
      expect(prompt).toContain('"type": "table"')
    })

    it('does not mention "coming in a future update" for tables', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).not.toContain('coming in a future update')
    })
  })

  describe('chat phase with app context', () => {
    const baseContext: AppContext = {
      config: { appName: 'Test', uiComponents: [] },
      data: [{ key: 'score', value: 42 }],
    }

    it('appends APP CONTEXT section', () => {
      const prompt = buildSystemPrompt('chat', baseContext)
      expect(prompt).toContain('APP CONTEXT')
      expect(prompt).toContain('Config:')
      expect(prompt).toContain('Data:')
    })

    it('does not include tables section when no tables', () => {
      const prompt = buildSystemPrompt('chat', baseContext)
      expect(prompt).not.toContain('Tables (with row counts)')
    })

    it('includes tables with row counts when tables are provided', () => {
      const context: AppContext = {
        ...baseContext,
        tables: [
          { id: 1, name: 'Expenses', columns: [{ name: 'amount', type: 'number' }], rowCount: 15 },
          { id: 2, name: 'Tasks', columns: [{ name: 'title', type: 'text' }], rowCount: 0 },
        ],
      }
      const prompt = buildSystemPrompt('chat', context)
      expect(prompt).toContain('Tables (with row counts)')
      expect(prompt).toContain('"rowCount":15')
      expect(prompt).toContain('"rowCount":0')
      expect(prompt).toContain('"name":"Expenses"')
      expect(prompt).toContain('"name":"Tasks"')
    })

    it('defaults rowCount to 0 when not provided', () => {
      const context: AppContext = {
        ...baseContext,
        tables: [
          { id: 1, name: 'Expenses', columns: [{ name: 'amount', type: 'number' }] },
        ],
      }
      const prompt = buildSystemPrompt('chat', context)
      expect(prompt).toContain('"rowCount":0')
    })

    it('does not include tables section for empty tables array', () => {
      const context: AppContext = {
        ...baseContext,
        tables: [],
      }
      const prompt = buildSystemPrompt('chat', context)
      expect(prompt).not.toContain('Tables (with row counts)')
    })

    it('truncates data values longer than 500 chars', () => {
      const longValue = 'x'.repeat(600)
      const context: AppContext = {
        config: {},
        data: [{ key: 'big', value: longValue }],
      }
      const prompt = buildSystemPrompt('chat', context)
      // Should contain truncated value (500 chars + ellipsis)
      expect(prompt).toContain('x'.repeat(500) + '…')
      expect(prompt).not.toContain('x'.repeat(501))
    })

    it('truncates tables section longer than 4000 chars', () => {
      // Create many tables to exceed 4000 chars
      const manyTables = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `Table_${i}_${'x'.repeat(50)}`,
        columns: [{ name: 'col1', type: 'text' }, { name: 'col2', type: 'number' }],
        rowCount: i * 10,
      }))
      const context: AppContext = {
        ...baseContext,
        tables: manyTables,
      }
      const prompt = buildSystemPrompt('chat', context)
      expect(prompt).toContain('Tables (with row counts)')
      // Should end with ellipsis if truncated
      const tablesMatch = prompt.match(/Tables \(with row counts\): (.+)/)
      expect(tablesMatch).toBeTruthy()
      if (tablesMatch && tablesMatch[1].length >= 4000) {
        expect(tablesMatch[1]).toMatch(/…$/)
      }
    })

    it('includes app memory when notes are provided', () => {
      const context: AppContext = {
        ...baseContext,
        notes: 'User prefers metric units',
      }
      const prompt = buildSystemPrompt('chat', context)
      expect(prompt).toContain('<app-memory>')
      expect(prompt).toContain('User prefers metric units')
    })
  })

  describe('non-chat phases ignore app context', () => {
    it('brainstorm phase does not append app context even if provided', () => {
      const context: AppContext = {
        config: { appName: 'Test' },
        data: [{ key: 'k', value: 'v' }],
        tables: [{ id: 1, name: 'T', columns: [], rowCount: 5 }],
      }
      const prompt = buildSystemPrompt('brainstorm', context)
      expect(prompt).not.toContain('APP CONTEXT')
      expect(prompt).not.toContain('Tables (with row counts)')
    })

    it('confirm phase does not append app context', () => {
      const context: AppContext = {
        config: {},
        data: [],
        tables: [{ id: 1, name: 'T', columns: [], rowCount: 5 }],
      }
      const prompt = buildSystemPrompt('confirm', context)
      expect(prompt).not.toContain('APP CONTEXT')
    })
  })
})
