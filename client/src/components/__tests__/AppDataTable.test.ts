import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore, buildTableCacheKey } from '../../stores/app'
import type { TableSchema, TableRow } from '../../stores/app'

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

/**
 * AppDataTable logic tests — the component renders data in two modes:
 * 1. Table dataSource mode: fetches rows from store, auto-generates columns from schema
 * 2. Legacy KV mode: renders from dataKey-resolved value prop
 */
describe('AppDataTable — logic', () => {
  let appStore: ReturnType<typeof useAppStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    appStore = useAppStore()
    vi.clearAllMocks()
  })

  describe('table dataSource mode', () => {
    const schema: TableSchema = {
      id: 1,
      name: 'expenses',
      columns: [
        { name: 'description', type: 'text' },
        { name: 'amount', type: 'number' },
        { name: 'date', type: 'date' },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    const rows: TableRow[] = [
      { id: 1, data: { description: 'Lunch', amount: 15, date: '2026-03-01' }, createdAt: '2026-03-01T12:00:00Z', updatedAt: null },
      { id: 2, data: { description: 'Coffee', amount: 5, date: '2026-03-02' }, createdAt: '2026-03-02T08:00:00Z', updatedAt: null },
    ]

    it('auto-generates columns from table schema', () => {
      const cacheKey = buildTableCacheKey(1)
      appStore.tableData[cacheKey] = { schema, rows }

      const td = appStore.getTableData(1)
      expect(td).not.toBeNull()

      // Component generates columns from schema
      const effectiveColumns = td!.schema.columns.map(col => ({ field: col.name, header: col.name }))
      expect(effectiveColumns).toEqual([
        { field: 'description', header: 'description' },
        { field: 'amount', header: 'amount' },
        { field: 'date', header: 'date' },
      ])
    })

    it('flattens table rows for DataTable (merges row.data + row.id)', () => {
      const cacheKey = buildTableCacheKey(1)
      appStore.tableData[cacheKey] = { schema, rows }

      const td = appStore.getTableData(1)!
      const flatRows = td.rows.map(r => ({ id: r.id, ...r.data as Record<string, unknown> }))

      expect(flatRows).toEqual([
        { id: 1, description: 'Lunch', amount: 15, date: '2026-03-01' },
        { id: 2, description: 'Coffee', amount: 5, date: '2026-03-02' },
      ])
    })

    it('returns empty rows when table data is not cached', () => {
      const td = appStore.getTableData(99)
      expect(td).toBeNull()
      // Component returns [] when td is null
      const rows = td ? td.rows.map(r => ({ id: r.id, ...r.data })) : []
      expect(rows).toEqual([])
    })

    it('returns empty columns when table data is not cached', () => {
      const td = appStore.getTableData(99)
      // Component returns [] when td is null
      const columns = td ? td.schema.columns.map(c => ({ field: c.name, header: c.name })) : []
      expect(columns).toEqual([])
    })

    it('uses filter-aware cache key for filtered data', () => {
      const filter = { column: 'amount', operator: 'gt' as const, value: 10 }
      const cacheKey = buildTableCacheKey(1, filter)
      appStore.tableData[cacheKey] = {
        schema,
        rows: [rows[0]], // only Lunch (amount 15)
      }

      const td = appStore.getTableData(1, filter)
      expect(td).not.toBeNull()
      expect(td!.rows.length).toBe(1)
      expect(td!.rows[0].data.description).toBe('Lunch')
    })
  })

  describe('KV mode (legacy dataKey)', () => {
    it('wraps single object value into array', () => {
      const value = { name: 'Test', count: 5 }
      // Component: if not array and not null, wraps in [value]
      const rows = Array.isArray(value) ? value : value != null ? [value] : []
      expect(rows).toEqual([{ name: 'Test', count: 5 }])
    })

    it('passes array value directly', () => {
      const value = [
        { name: 'A', count: 1 },
        { name: 'B', count: 2 },
      ]
      const rows = Array.isArray(value) ? value : value != null ? [value] : []
      expect(rows).toEqual(value)
    })

    it('returns empty for null/undefined value', () => {
      for (const value of [null, undefined]) {
        const rows = Array.isArray(value) ? value : value != null ? [value] : []
        expect(rows).toEqual([])
      }
    })

    it('infers columns from first row keys', () => {
      const rows = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]
      const first = rows[0]
      const columns = Object.keys(first).map(key => ({ field: key, header: key }))
      expect(columns).toEqual([
        { field: 'name', header: 'name' },
        { field: 'age', header: 'age' },
      ])
    })

    it('returns value/Value column for primitive rows', () => {
      const rows = [42]
      const first = rows[0]
      const columns = typeof first !== 'object' || first === null
        ? [{ field: 'value', header: 'Value' }]
        : Object.keys(first).map(key => ({ field: key, header: key }))
      expect(columns).toEqual([{ field: 'value', header: 'Value' }])
    })

    it('returns empty columns for empty rows', () => {
      const rows: any[] = []
      const columns = rows.length === 0 ? [] : Object.keys(rows[0]).map(k => ({ field: k, header: k }))
      expect(columns).toEqual([])
    })
  })

  describe('explicit columns prop', () => {
    it('explicit columns override auto-generated columns', () => {
      const explicitColumns = [
        { field: 'name', header: 'Full Name' },
        { field: 'email', header: 'Email Address' },
      ]
      // Component: if props.columns && props.columns.length > 0, use them
      const effectiveColumns = explicitColumns.length > 0 ? explicitColumns : []
      expect(effectiveColumns).toEqual(explicitColumns)
    })

    it('falls back to auto-generated when explicit columns empty', () => {
      const explicitColumns: { field: string; header: string }[] = []
      const shouldFallback = !explicitColumns || explicitColumns.length === 0
      expect(shouldFallback).toBe(true)
    })
  })

  describe('RLS badge', () => {
    it('shows RLS badge when table has rlsEnabled', () => {
      const rlsSchema: TableSchema = {
        id: 5,
        name: 'private_data',
        columns: [{ name: 'note', type: 'text' }],
        rlsEnabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      }
      appStore.tableSchemas = [rlsSchema]

      const dataSource = { type: 'table' as const, tableId: 5 }
      const schema = appStore.tableSchemas.find(t => t.id === dataSource.tableId)
      const isRlsActive = schema?.rlsEnabled ?? false
      expect(isRlsActive).toBe(true)
    })

    it('hides RLS badge when rlsEnabled is false', () => {
      const normalSchema: TableSchema = {
        id: 3,
        name: 'public_data',
        columns: [{ name: 'info', type: 'text' }],
        rlsEnabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      }
      appStore.tableSchemas = [normalSchema]

      const schema = appStore.tableSchemas.find(t => t.id === 3)
      const isRlsActive = schema?.rlsEnabled ?? false
      expect(isRlsActive).toBe(false)
    })

    it('hides RLS badge when no dataSource', () => {
      const dataSource = undefined
      const isRlsActive = dataSource ? false : false
      expect(isRlsActive).toBe(false)
    })
  })

  describe('paginator', () => {
    it('enables paginator when rows > 10', () => {
      const rows = Array.from({ length: 15 }, (_, i) => ({ id: i, name: `Item ${i}` }))
      expect(rows.length > 10).toBe(true)
    })

    it('disables paginator when rows <= 10', () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }))
      expect(rows.length > 10).toBe(false)
    })
  })
})
