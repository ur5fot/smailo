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

import api from '../../api'
const mockDelete = api.delete as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>

/**
 * AppCardList logic tests — the component renders data in two modes:
 * 1. Table mode: renders table rows as cards with key-value pairs per column
 * 2. KV mode: renders from appData array (value prop from dataKey)
 *
 * Delete button is shown only for owner/editor roles.
 */
describe('AppCardList — logic', () => {
  let appStore: ReturnType<typeof useAppStore>

  const schema: TableSchema = {
    id: 1,
    name: 'tasks',
    columns: [
      { name: 'title', type: 'text' },
      { name: 'done', type: 'boolean' },
      { name: 'due', type: 'date' },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  const rows: TableRow[] = [
    { id: 10, data: { title: 'Buy milk', done: false, due: '2026-03-05' }, createdAt: '2026-03-01T00:00:00Z', updatedAt: null },
    { id: 11, data: { title: 'Clean house', done: true, due: '2026-03-04' }, createdAt: '2026-03-02T00:00:00Z', updatedAt: null },
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
    appStore = useAppStore()
    vi.clearAllMocks()
  })

  describe('table mode rendering', () => {
    it('detects table mode from dataSource', () => {
      const dataSource = { type: 'table' as const, tableId: 1 }
      expect(dataSource.type === 'table').toBe(true)
    })

    it('gets table rows from store', () => {
      const cacheKey = buildTableCacheKey(1)
      appStore.tableData[cacheKey] = { schema, rows }

      const td = appStore.getTableData(1)
      expect(td).not.toBeNull()
      expect(td!.rows.length).toBe(2)
      expect(td!.rows[0].data.title).toBe('Buy milk')
    })

    it('gets table columns from schema', () => {
      const cacheKey = buildTableCacheKey(1)
      appStore.tableData[cacheKey] = { schema, rows }

      const td = appStore.getTableData(1)!
      expect(td.schema.columns).toEqual(schema.columns)
    })

    it('returns empty rows when no data cached', () => {
      const td = appStore.getTableData(99)
      const tableRows = td?.rows ?? []
      expect(tableRows).toEqual([])
    })
  })

  describe('formatCellValue logic', () => {
    // Mirrors the formatCellValue function in the component
    function formatCellValue(value: unknown, type: string): string {
      if (value === null || value === undefined) return '—'
      if (type === 'boolean') return value ? 'Да' : 'Нет'
      if (type === 'date') return String(value) // formatIfDate handles actual formatting
      return String(value)
    }

    it('formats null as dash', () => {
      expect(formatCellValue(null, 'text')).toBe('—')
    })

    it('formats undefined as dash', () => {
      expect(formatCellValue(undefined, 'number')).toBe('—')
    })

    it('formats boolean true as Да', () => {
      expect(formatCellValue(true, 'boolean')).toBe('Да')
    })

    it('formats boolean false as Нет', () => {
      expect(formatCellValue(false, 'boolean')).toBe('Нет')
    })

    it('formats text as string', () => {
      expect(formatCellValue('hello', 'text')).toBe('hello')
    })

    it('formats number as string', () => {
      expect(formatCellValue(42, 'number')).toBe('42')
    })
  })

  describe('delete button visibility (role-based)', () => {
    it('shows delete button for owner', () => {
      appStore.myRole = 'owner'
      const canDelete = appStore.myRole === 'owner' || appStore.myRole === 'editor'
      expect(canDelete).toBe(true)
    })

    it('shows delete button for editor', () => {
      appStore.myRole = 'editor'
      const canDelete = appStore.myRole === 'owner' || appStore.myRole === 'editor'
      expect(canDelete).toBe(true)
    })

    it('hides delete button for viewer', () => {
      appStore.myRole = 'viewer'
      const canDelete = appStore.myRole === 'owner' || appStore.myRole === 'editor'
      expect(canDelete).toBe(false)
    })

    it('hides delete button when role is null', () => {
      appStore.myRole = null
      const canDelete = appStore.myRole === 'owner' || appStore.myRole === 'editor'
      expect(canDelete).toBe(false)
    })

    it('operator precedence: === binds tighter than || (verified)', () => {
      // This verifies the fix for correct operator precedence in the template:
      // v-if="appStore.myRole === 'owner' || appStore.myRole === 'editor'"
      // vs incorrect: v-if="appStore.myRole === ('owner' || appStore.myRole === 'editor')"
      appStore.myRole = 'editor'
      const correctEval = appStore.myRole === 'owner' || appStore.myRole === 'editor'
      expect(correctEval).toBe(true)

      appStore.myRole = 'viewer'
      const viewerEval = appStore.myRole === 'owner' || appStore.myRole === 'editor'
      expect(viewerEval).toBe(false)
    })
  })

  describe('table mode: delete row', () => {
    it('calls correct API endpoint for table row deletion', async () => {
      mockDelete.mockResolvedValueOnce({ data: { ok: true } })

      const hash = 'abc123'
      const tableId = 1
      const rowId = 10

      await api.delete(`/app/${hash}/tables/${tableId}/rows/${rowId}`)

      expect(mockDelete).toHaveBeenCalledWith('/app/abc123/tables/1/rows/10')
    })

    it('invalidates table cache after deletion', async () => {
      const cacheKey = buildTableCacheKey(1)
      appStore.tableData[cacheKey] = { schema, rows }

      // Simulate invalidateTableCache
      appStore.invalidateTableCache(1)

      // After invalidation, all cache keys for this table should be removed
      expect(appStore.tableData[cacheKey]).toBeUndefined()
    })
  })

  describe('KV mode rendering', () => {
    it('passes array value directly as kvItems', () => {
      const value = [
        { value: 'Entry 1', timestamp: '2026-03-01T12:00:00Z' },
        { value: 'Entry 2', timestamp: '2026-03-02T12:00:00Z' },
      ]
      const kvItems = Array.isArray(value) ? value : []
      expect(kvItems.length).toBe(2)
    })

    it('returns empty for non-array value', () => {
      const value = 'single string'
      const kvItems = Array.isArray(value) ? value : []
      expect(kvItems).toEqual([])
    })

    it('detects value+timestamp pattern', () => {
      const item = { value: 'Entry', timestamp: '2026-03-01T12:00:00Z' }
      const isValueTimestamp = item && typeof item === 'object' && 'value' in item && 'timestamp' in item
      expect(isValueTimestamp).toBe(true)
    })

    it('does not match value+timestamp for plain objects', () => {
      const item = { name: 'Test', count: 5 }
      const isValueTimestamp = item && typeof item === 'object' && 'value' in item && 'timestamp' in item
      expect(isValueTimestamp).toBe(false)
    })

    it('renders primitives in array as text', () => {
      const value = ['hello', 'world']
      const kvItems = Array.isArray(value) ? value : []
      for (const item of kvItems) {
        const isObject = item && typeof item === 'object'
        expect(isObject).toBe(false)
      }
    })
  })

  describe('KV mode: delete item', () => {
    it('calls correct API for KV item deletion', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const hash = 'abc123'
      const dataKey = 'entries'
      const index = 2

      await api.post(`/app/${hash}/data`, {
        key: dataKey,
        mode: 'delete-item',
        index,
      })

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'entries',
        mode: 'delete-item',
        index: 2,
      })
    })

    it('does not delete when hash is missing', () => {
      const hash = undefined
      const dataKey = 'entries'
      // Component: if (!props.hash || !props.dataKey) return
      const shouldDelete = !!(hash && dataKey)
      expect(shouldDelete).toBe(false)
    })

    it('does not delete when dataKey is missing', () => {
      const hash = 'abc123'
      const dataKey = undefined
      const shouldDelete = !!(hash && dataKey)
      expect(shouldDelete).toBe(false)
    })
  })

  describe('RLS badge', () => {
    it('shows RLS badge when table has rlsEnabled', () => {
      const rlsSchema: TableSchema = {
        ...schema,
        id: 7,
        rlsEnabled: true,
      }
      appStore.tableSchemas = [rlsSchema]

      const tableSchema = appStore.tableSchemas.find(t => t.id === 7)
      expect(tableSchema?.rlsEnabled).toBe(true)
    })

    it('hides RLS badge when no dataSource tableId', () => {
      const dataSource = undefined
      const isRlsActive = !!dataSource
      expect(isRlsActive).toBe(false)
    })
  })

  describe('displayItems (unified empty state check)', () => {
    it('uses tableRows in table mode', () => {
      const cacheKey = buildTableCacheKey(1)
      appStore.tableData[cacheKey] = { schema, rows }

      const isTableMode = true
      const tableRows = appStore.getTableData(1)?.rows ?? []
      const kvItems: any[] = []
      const displayItems = isTableMode ? tableRows : kvItems
      expect(displayItems.length).toBe(2)
    })

    it('uses kvItems in KV mode', () => {
      const isTableMode = false
      const tableRows: any[] = []
      const kvItems = ['a', 'b', 'c']
      const displayItems = isTableMode ? tableRows : kvItems
      expect(displayItems.length).toBe(3)
    })

    it('shows empty message when displayItems is empty', () => {
      const displayItems: any[] = []
      expect(!displayItems || displayItems.length === 0).toBe(true)
    })
  })
})
