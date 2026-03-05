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
