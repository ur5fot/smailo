import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../app'

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
