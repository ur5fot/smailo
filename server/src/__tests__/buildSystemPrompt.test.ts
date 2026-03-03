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
      const tablesMatch = prompt.match(/Tables \(with row counts\): (.+)/)
      expect(tablesMatch).toBeTruthy()
      // Verify the raw table data would exceed 4000 chars (test data is sufficient)
      const rawTablesStr = manyTables.map(t => `${t.name}(${t.columns.map(c => c.name).join(',')}):${t.rowCount} rows`).join('; ')
      expect(rawTablesStr.length).toBeGreaterThan(4000)
      // The output must be truncated with ellipsis
      expect(tablesMatch![1]).toMatch(/…$/)
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

  describe('brainstorm prompt includes formula documentation', () => {
    it('documents formula column type with syntax', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('FORMULA COLUMNS')
      expect(prompt).toContain('"type": "formula"')
      expect(prompt).toContain('"formula"')
    })

    it('lists available formula functions', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('IF(condition, thenValue, elseValue)')
      expect(prompt).toContain('SUM(column)')
      expect(prompt).toContain('AVG(column)')
      expect(prompt).toContain('COUNT()')
      expect(prompt).toContain('ABS(n)')
      expect(prompt).toContain('ROUND(n, decimals?)')
      expect(prompt).toContain('UPPER(s)')
      expect(prompt).toContain('LOWER(s)')
      expect(prompt).toContain('CONCAT(s1, s2, ...)')
      expect(prompt).toContain('NOW()')
    })

    it('includes formula column examples', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('price * quantity')
      expect(prompt).toContain('ROUND(price * 0.9, 2)')
    })

    it('documents computedValue on components', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('COMPUTED VALUES ON COMPONENTS')
      expect(prompt).toContain('computedValue')
      expect(prompt).toContain('= SUM(')
      expect(prompt).toContain('= AVG(')
      expect(prompt).toContain('= COUNT(')
    })

    it('provides guidance on when to use formulas vs cron', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('WHEN TO USE WHAT')
      expect(prompt).toContain('formula')
      expect(prompt).toContain('computedValue')
      expect(prompt).toContain('aggregate_data')
      expect(prompt).toContain('Prefer formula columns and computedValue for new apps')
    })

    it('includes formula in column types list', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toMatch(/Column types:.*formula/)
    })
  })

  describe('chat prompt includes formula documentation', () => {
    it('documents computedValue syntax', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('COMPUTED VALUES')
      expect(prompt).toContain('computedValue')
      expect(prompt).toContain('= SUM(')
    })

    it('lists available formula functions', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('IF')
      expect(prompt).toContain('SUM')
      expect(prompt).toContain('AVG')
      expect(prompt).toContain('COUNT')
      expect(prompt).toContain('ROUND')
    })

    it('mentions formula columns in tables section', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('formula columns')
    })

    it('includes computedValue in data binding options', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('computedValue is for aggregate calculations')
    })
  })

  describe('brainstorm prompt includes conditional rendering documentation', () => {
    it('documents showIf field on components', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('CONDITIONAL RENDERING')
      expect(prompt).toContain('showIf')
      expect(prompt).toContain('hidden when the result is falsy')
    })

    it('documents styleIf with available classes', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('styleIf')
      expect(prompt).toContain('warning')
      expect(prompt).toContain('critical')
      expect(prompt).toContain('success')
      expect(prompt).toContain('muted')
      expect(prompt).toContain('highlight')
    })

    it('documents ConditionalGroup component', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('ConditionalGroup')
      expect(prompt).toContain('"condition"')
      expect(prompt).toContain('"children"')
      expect(prompt).toContain('max 1 level')
    })

    it('includes ConditionalGroup in the component type list', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('"ConditionalGroup"')
    })
  })

  describe('chat prompt includes conditional rendering documentation', () => {
    it('documents showIf field', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('CONDITIONAL RENDERING')
      expect(prompt).toContain('showIf')
    })

    it('documents styleIf with available classes', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('styleIf')
      expect(prompt).toContain('warning')
      expect(prompt).toContain('critical')
      expect(prompt).toContain('success')
    })

    it('documents ConditionalGroup in component guide', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('ConditionalGroup')
      expect(prompt).toContain('"condition"')
      expect(prompt).toContain('"children"')
    })
  })

  describe('brainstorm prompt includes multi-page documentation', () => {
    it('documents pages field with MULTI-PAGE APPS section', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('MULTI-PAGE APPS')
      expect(prompt).toContain('"pages"')
    })

    it('documents page structure with id, title, icon, uiComponents', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('"id"')
      expect(prompt).toContain('"title"')
      expect(prompt).toContain('"icon"')
    })

    it('documents page constraints (max 10 pages, max 20 components)', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('Max 10 pages')
      expect(prompt).toContain('max 20 components per page')
    })

    it('includes pages in app config format', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toMatch(/"pages".*optional/s)
    })

    it('describes when to use vs when not to use pages', () => {
      const prompt = buildSystemPrompt('brainstorm')
      expect(prompt).toContain('When to use pages')
      expect(prompt).toContain('When NOT to use pages')
    })
  })

  describe('chat prompt includes multi-page documentation', () => {
    it('documents pagesUpdate field in response format', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('pagesUpdate')
    })

    it('documents pagesUpdate as full replacement of pages array', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('FULL REPLACEMENT of the entire pages array')
    })

    it('documents MULTI-PAGE APPS section with pages structure', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('MULTI-PAGE APPS')
      expect(prompt).toContain('"pages"')
    })

    it('advises not to use uiUpdate when app has pages', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('Do NOT use "uiUpdate" when the app has pages')
    })

    it('advises not to use pagesUpdate when app has no pages', () => {
      const prompt = buildSystemPrompt('chat')
      expect(prompt).toContain('Do NOT use "pagesUpdate" when the app has no pages')
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
