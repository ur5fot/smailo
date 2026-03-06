import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock localStorage before anything imports it
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear: () => { for (const k of Object.keys(storage)) delete storage[k] },
  get length() { return Object.keys(storage).length },
  key: (_i: number) => null as string | null,
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '../../api'
import { useUserStore } from '../user'

const mockPost = api.post as ReturnType<typeof vi.fn>
const mockGet = api.get as ReturnType<typeof vi.fn>

describe('useUserStore — createUser with JWT', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('saves userId and token to localStorage on createUser', async () => {
    mockPost.mockResolvedValueOnce({
      data: { userId: 'testUser01', token: 'jwt-token-abc' },
    })

    const store = useUserStore()
    const uid = await store.createUser()

    expect(uid).toBe('testUser01')
    expect(store.userId).toBe('testUser01')
    expect(localStorageMock.getItem('smailo_user_id')).toBe('testUser01')
    expect(localStorageMock.getItem('smailo_token')).toBe('jwt-token-abc')
  })

  it('handles response without token (backward compat)', async () => {
    mockPost.mockResolvedValueOnce({
      data: { userId: 'testUser02' },
    })

    const store = useUserStore()
    await store.createUser()

    expect(localStorageMock.getItem('smailo_user_id')).toBe('testUser02')
    expect(localStorageMock.getItem('smailo_token')).toBeNull()
  })
})

describe('useUserStore — fetchApps with shared apps', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('parses new format with myApps and sharedApps', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        myApps: [
          { hash: 'h1', appName: 'My App', description: 'desc1', createdAt: '2026-01-01', lastVisit: null, role: 'owner' },
        ],
        sharedApps: [
          { hash: 'h2', appName: 'Shared App', description: 'desc2', createdAt: '2026-01-02', lastVisit: null, role: 'editor' },
          { hash: 'h3', appName: 'View App', description: 'desc3', createdAt: '2026-01-03', lastVisit: null, role: 'viewer' },
        ],
      },
    })

    const store = useUserStore()
    await store.fetchApps('user1')

    expect(store.myApps).toHaveLength(1)
    expect(store.myApps[0].hash).toBe('h1')
    expect(store.myApps[0].role).toBe('owner')

    expect(store.sharedApps).toHaveLength(2)
    expect(store.sharedApps[0].role).toBe('editor')
    expect(store.sharedApps[1].role).toBe('viewer')

    // Combined apps list
    expect(store.apps).toHaveLength(3)
  })

  it('handles legacy array format', async () => {
    mockGet.mockResolvedValueOnce({
      data: [
        { hash: 'h1', appName: 'App 1', description: 'd1', createdAt: '2026-01-01', lastVisit: null },
      ],
    })

    const store = useUserStore()
    await store.fetchApps('user1')

    expect(store.myApps).toHaveLength(1)
    expect(store.myApps[0].role).toBe('owner')
    expect(store.sharedApps).toHaveLength(0)
    expect(store.apps).toHaveLength(1)
  })

  it('handles empty result', async () => {
    mockGet.mockResolvedValueOnce({
      data: { myApps: [], sharedApps: [] },
    })

    const store = useUserStore()
    await store.fetchApps('user1')

    expect(store.myApps).toHaveLength(0)
    expect(store.sharedApps).toHaveLength(0)
    expect(store.apps).toHaveLength(0)
  })
})
