import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../../stores/app'
import { useEditorStore } from '../../stores/editor'

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '../../api'
const mockPut = api.put as ReturnType<typeof vi.fn>

describe('RLS UI logic', () => {
  let appStore: ReturnType<typeof useAppStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    appStore = useAppStore()
    vi.clearAllMocks()
  })

  describe('TableSchema rlsEnabled field', () => {
    it('tableSchemas stores rlsEnabled from fetchApp', () => {
      // Simulate what fetchApp sets
      appStore.tableSchemas = [
        { id: 1, name: 'tasks', columns: [], rlsEnabled: true, createdAt: '2026-01-01' },
        { id: 2, name: 'notes', columns: [], rlsEnabled: false, createdAt: '2026-01-01' },
      ]
      expect(appStore.tableSchemas[0].rlsEnabled).toBe(true)
      expect(appStore.tableSchemas[1].rlsEnabled).toBe(false)
    })

    it('rlsEnabled defaults to undefined for legacy schemas', () => {
      appStore.tableSchemas = [
        { id: 1, name: 'old_table', columns: [], createdAt: '2026-01-01' },
      ]
      expect(appStore.tableSchemas[0].rlsEnabled).toBeUndefined()
    })
  })

  describe('toggleTableRls', () => {
    it('calls PUT with rlsEnabled and updates local schema', async () => {
      appStore.tableSchemas = [
        { id: 1, name: 'tasks', columns: [], rlsEnabled: false, createdAt: '2026-01-01' },
      ]
      mockPut.mockResolvedValueOnce({ data: { ok: true } })

      await appStore.toggleTableRls('test-hash', 1, true)

      expect(mockPut).toHaveBeenCalledWith('/app/test-hash/tables/1', { rlsEnabled: true })
      expect(appStore.tableSchemas[0].rlsEnabled).toBe(true)
    })

    it('toggles RLS off', async () => {
      appStore.tableSchemas = [
        { id: 1, name: 'tasks', columns: [], rlsEnabled: true, createdAt: '2026-01-01' },
      ]
      mockPut.mockResolvedValueOnce({ data: { ok: true } })

      await appStore.toggleTableRls('test-hash', 1, false)

      expect(appStore.tableSchemas[0].rlsEnabled).toBe(false)
    })

    it('propagates error on API failure', async () => {
      appStore.tableSchemas = [
        { id: 1, name: 'tasks', columns: [], rlsEnabled: false, createdAt: '2026-01-01' },
      ]
      mockPut.mockRejectedValueOnce(new Error('Forbidden'))

      await expect(appStore.toggleTableRls('test-hash', 1, true)).rejects.toThrow('Forbidden')
    })
  })

  describe('PropertyEditor RLS status logic', () => {
    it('shows RLS badge when dataSource table has rlsEnabled', () => {
      appStore.tableSchemas = [
        { id: 5, name: 'items', columns: [], rlsEnabled: true, createdAt: '2026-01-01' },
      ]

      // Simulate the computed logic from PropertyEditor
      const dataSource = { type: 'table' as const, tableId: 5 }
      const tableId = dataSource.tableId
      const schema = appStore.tableSchemas.find(t => t.id === tableId)
      const selectedTableRls = schema?.rlsEnabled ?? false

      expect(selectedTableRls).toBe(true)
    })

    it('does not show RLS badge when table has rlsEnabled=false', () => {
      appStore.tableSchemas = [
        { id: 5, name: 'items', columns: [], rlsEnabled: false, createdAt: '2026-01-01' },
      ]

      const dataSource = { type: 'table' as const, tableId: 5 }
      const schema = appStore.tableSchemas.find(t => t.id === dataSource.tableId)
      const selectedTableRls = schema?.rlsEnabled ?? false

      expect(selectedTableRls).toBe(false)
    })

    it('returns false when no dataSource', () => {
      const tableId = undefined
      const selectedTableRls = tableId
        ? (appStore.tableSchemas.find(t => t.id === tableId)?.rlsEnabled ?? false)
        : false

      expect(selectedTableRls).toBe(false)
    })
  })

  describe('DataTable/CardList RLS badge logic', () => {
    it('isRlsActive is true when table has rlsEnabled', () => {
      appStore.tableSchemas = [
        { id: 3, name: 'entries', columns: [], rlsEnabled: true, createdAt: '2026-01-01' },
      ]

      const dataSource = { type: 'table' as const, tableId: 3 }
      const schema = appStore.tableSchemas.find(t => t.id === dataSource.tableId)
      const isRlsActive = schema?.rlsEnabled ?? false

      expect(isRlsActive).toBe(true)
    })

    it('isRlsActive is false when table has rlsEnabled=false', () => {
      appStore.tableSchemas = [
        { id: 3, name: 'entries', columns: [], rlsEnabled: false, createdAt: '2026-01-01' },
      ]

      const dataSource = { type: 'table' as const, tableId: 3 }
      const schema = appStore.tableSchemas.find(t => t.id === dataSource.tableId)
      const isRlsActive = schema?.rlsEnabled ?? false

      expect(isRlsActive).toBe(false)
    })

    it('isRlsActive is false when no dataSource', () => {
      const dataSource = undefined
      const isRlsActive = dataSource
        ? (appStore.tableSchemas.find(t => t.id === dataSource.tableId)?.rlsEnabled ?? false)
        : false

      expect(isRlsActive).toBe(false)
    })

    it('isRlsActive is false when table not found in schemas', () => {
      appStore.tableSchemas = []

      const dataSource = { type: 'table' as const, tableId: 99 }
      const schema = appStore.tableSchemas.find(t => t.id === dataSource.tableId)
      const isRlsActive = schema?.rlsEnabled ?? false

      expect(isRlsActive).toBe(false)
    })
  })

  describe('MembersPanel RLS toggle logic', () => {
    it('tablesList reflects tableSchemas from store', () => {
      appStore.tableSchemas = [
        { id: 1, name: 'tasks', columns: [], rlsEnabled: true, createdAt: '2026-01-01' },
        { id: 2, name: 'notes', columns: [], rlsEnabled: false, createdAt: '2026-01-01' },
      ]

      // MembersPanel uses computed(() => appStore.tableSchemas)
      const tablesList = appStore.tableSchemas
      expect(tablesList).toHaveLength(2)
      expect(tablesList[0].rlsEnabled).toBe(true)
      expect(tablesList[1].rlsEnabled).toBe(false)
    })

    it('RLS toggle section hidden when no tables', () => {
      appStore.tableSchemas = []
      // v-if="tablesList.length > 0" would be false
      expect(appStore.tableSchemas.length > 0).toBe(false)
    })

    it('RLS toggle updates local state after successful API call', async () => {
      appStore.tableSchemas = [
        { id: 1, name: 'tasks', columns: [], rlsEnabled: false, createdAt: '2026-01-01' },
      ]
      mockPut.mockResolvedValueOnce({ data: { ok: true } })

      await appStore.toggleTableRls('hash', 1, true)

      expect(appStore.tableSchemas[0].rlsEnabled).toBe(true)
    })
  })
})
