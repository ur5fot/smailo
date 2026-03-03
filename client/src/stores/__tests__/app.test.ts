import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore, type FilterCondition } from '../app'

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '../../api'
const mockGet = api.get as ReturnType<typeof vi.fn>

describe('useAppStore — filter-aware table cache', () => {
  const mockTableResponse = {
    data: {
      id: 5,
      name: 'Tasks',
      columns: [{ name: 'priority', type: 'text' }],
      createdAt: '2024-01-01',
      rows: [{ id: 1, data: { priority: 'high' }, createdAt: '2024-01-01', updatedAt: null }],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('caches rows under plain string key when no filter', async () => {
    mockGet.mockResolvedValueOnce(mockTableResponse)
    const store = useAppStore()
    const rows = await store.fetchTableRows('abc', 5)
    expect(rows).toHaveLength(1)
    expect(store.tableData['5']).toBeDefined()
    expect(store.tableData['5'].rows).toHaveLength(1)
  })

  it('cache hit with same tableId + same filter — no second API call', async () => {
    mockGet.mockResolvedValueOnce(mockTableResponse)
    const store = useAppStore()
    const filter: FilterCondition = { column: 'priority', value: 'high' }
    await store.fetchTableRows('abc', 5, filter)
    await store.fetchTableRows('abc', 5, filter)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('cache miss with same tableId + different filter — two API calls', async () => {
    mockGet.mockResolvedValue(mockTableResponse)
    const store = useAppStore()
    await store.fetchTableRows('abc', 5, { column: 'priority', value: 'high' })
    await store.fetchTableRows('abc', 5, { column: 'priority', value: 'low' })
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('cache key is stable regardless of filter array ordering', async () => {
    mockGet.mockResolvedValueOnce(mockTableResponse)
    const store = useAppStore()
    const filter1: FilterCondition[] = [
      { column: 'status', value: 'active' },
      { column: 'priority', value: 'high' },
    ]
    const filter2: FilterCondition[] = [
      { column: 'priority', value: 'high' },
      { column: 'status', value: 'active' },
    ]
    await store.fetchTableRows('abc', 5, filter1)
    await store.fetchTableRows('abc', 5, filter2)
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('no-filter and filtered requests are cached separately', async () => {
    mockGet.mockResolvedValue(mockTableResponse)
    const store = useAppStore()
    await store.fetchTableRows('abc', 5)
    await store.fetchTableRows('abc', 5, { column: 'priority', value: 'high' })
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(store.tableData['5']).toBeDefined()
    const filteredKey = Object.keys(store.tableData).find(k => k.startsWith('5:'))
    expect(filteredKey).toBeDefined()
  })

  it('refreshTable invalidates cache and re-fetches', async () => {
    mockGet.mockResolvedValue(mockTableResponse)
    const store = useAppStore()
    const filter: FilterCondition = { column: 'priority', value: 'high' }
    await store.fetchTableRows('abc', 5, filter)
    expect(mockGet).toHaveBeenCalledTimes(1)
    await store.refreshTable('abc', 5, filter)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('refreshTable without filter invalidates unfilitered cache entry', async () => {
    mockGet.mockResolvedValue(mockTableResponse)
    const store = useAppStore()
    await store.fetchTableRows('abc', 5)
    expect(mockGet).toHaveBeenCalledTimes(1)
    await store.refreshTable('abc', 5)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('different tableIds are cached separately', async () => {
    mockGet.mockResolvedValue(mockTableResponse)
    const store = useAppStore()
    await store.fetchTableRows('abc', 5)
    await store.fetchTableRows('abc', 6)
    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(store.tableData['5']).toBeDefined()
    expect(store.tableData['6']).toBeDefined()
  })

  it('getTableData returns cached rows by filter key', async () => {
    mockGet.mockResolvedValueOnce(mockTableResponse)
    const store = useAppStore()
    const filter: FilterCondition = { column: 'priority', value: 'high' }
    await store.fetchTableRows('abc', 5, filter)
    const cached = store.getTableData(5, filter)
    expect(cached).not.toBeNull()
    expect(cached!.rows).toHaveLength(1)
  })

  it('getTableData returns schema-only when no rows loaded yet', () => {
    const store = useAppStore()
    store.tableSchemas = [
      { id: 5, name: 'Tasks', columns: [], createdAt: '2024-01-01' },
    ] as any
    const result = store.getTableData(5)
    expect(result).not.toBeNull()
    expect(result!.rows).toHaveLength(0)
    expect(result!.schema.id).toBe(5)
  })
})

describe('useAppStore — pages getter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns undefined when appConfig is null', () => {
    const store = useAppStore()
    expect(store.pages).toBeUndefined()
  })

  it('returns undefined when appConfig has no pages field', () => {
    const store = useAppStore()
    store.appConfig = { appName: 'Test', description: '', uiComponents: [] } as any
    expect(store.pages).toBeUndefined()
  })

  it('returns undefined when pages is not an array', () => {
    const store = useAppStore()
    store.appConfig = { pages: 'invalid' } as any
    expect(store.pages).toBeUndefined()
  })

  it('returns empty array when pages is an empty array', () => {
    const store = useAppStore()
    store.appConfig = { pages: [] } as any
    expect(store.pages).toEqual([])
  })

  it('returns pages array from appConfig', () => {
    const store = useAppStore()
    const pages = [
      { id: 'main', title: 'Main', uiComponents: [] },
      { id: 'reports', title: 'Reports', uiComponents: [{ component: 'Card', props: {} }] },
    ]
    store.appConfig = { pages } as any
    expect(store.pages).toEqual(pages)
  })

  it('returns correct page structure with icon', () => {
    const store = useAppStore()
    const pages = [{ id: 'dash', title: 'Dashboard', icon: 'pi pi-home', uiComponents: [] }]
    store.appConfig = { pages } as any
    expect(store.pages?.[0].icon).toBe('pi pi-home')
  })

  it('single-page app without pages field is unchanged (backward compat)', () => {
    const store = useAppStore()
    store.appConfig = {
      appName: 'Legacy App',
      description: 'no pages',
      uiComponents: [{ component: 'Card', props: {} }],
    } as any
    expect(store.pages).toBeUndefined()
    expect((store.appConfig as any).uiComponents).toHaveLength(1)
  })
})

describe('localComputedValues offset logic', () => {
  it('computes local index offset correctly', () => {
    // Simulate the logic from AppView's localComputedValues computed
    const pages = [
      { id: 'main', title: 'Main', uiComponents: [{}, {}, {}] },
      { id: 'reports', title: 'Reports', uiComponents: [{}, {}] },
    ]
    const globalComputedValues: Record<number, unknown> = { 0: 'v0', 2: 'v2', 3: 'r0', 4: 'r1' }

    function computeLocal(currentPageId: string) {
      const pageIndex = pages.findIndex(p => p.id === currentPageId)
      const currentPage = pages[pageIndex]
      const offset = pages.slice(0, pageIndex).reduce((sum, p) => sum + p.uiComponents.length, 0)
      const result: Record<number, unknown> = {}
      for (const [key, value] of Object.entries(globalComputedValues)) {
        const localIdx = Number(key) - offset
        if (localIdx >= 0 && localIdx < currentPage.uiComponents.length) {
          result[localIdx] = value
        }
      }
      return result
    }

    // First page: offset=0, indices 0,1,2 → local 0,1,2
    expect(computeLocal('main')).toEqual({ 0: 'v0', 2: 'v2' })

    // Second page: offset=3, global indices 3,4 → local 0,1
    expect(computeLocal('reports')).toEqual({ 0: 'r0', 1: 'r1' })
  })

  it('filters out components not belonging to current page', () => {
    const pages = [
      { id: 'a', title: 'A', uiComponents: [{}] },
      { id: 'b', title: 'B', uiComponents: [{}] },
    ]
    const globalComputedValues: Record<number, unknown> = { 0: 'a0', 1: 'b0' }

    function computeLocal(currentPageId: string) {
      const pageIndex = pages.findIndex(p => p.id === currentPageId)
      const currentPage = pages[pageIndex]
      const offset = pages.slice(0, pageIndex).reduce((sum, p) => sum + p.uiComponents.length, 0)
      const result: Record<number, unknown> = {}
      for (const [key, value] of Object.entries(globalComputedValues)) {
        const localIdx = Number(key) - offset
        if (localIdx >= 0 && localIdx < currentPage.uiComponents.length) {
          result[localIdx] = value
        }
      }
      return result
    }

    expect(computeLocal('a')).toEqual({ 0: 'a0' })
    expect(computeLocal('b')).toEqual({ 0: 'b0' })
  })
})
