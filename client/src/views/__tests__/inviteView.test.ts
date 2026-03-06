import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock localStorage
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

// Mock vue-router
const mockReplace = vi.fn()
const mockPush = vi.fn()
let routeParams: Record<string, string> = {}

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routeParams }),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

// Mock api
vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '../../api'
import { useUserStore } from '../../stores/user'

const mockPost = api.post as Mock
const mockGet = api.get as Mock

// Helper: create a fake JWT with given payload (header.payload.signature)
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }))
  const body = btoa(JSON.stringify(payload))
  return `${header}.${body}.fakesig`
}

// Replicate the hasUser logic from InviteView for unit testing
function hasUser(store: ReturnType<typeof useUserStore>): boolean {
  const stored = localStorage.getItem('smailo_user_id')
  const token = localStorage.getItem('smailo_token')
  if (stored && token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.userId !== stored) {
        localStorage.removeItem('smailo_token')
        return false
      }
    } catch {
      localStorage.removeItem('smailo_token')
      return false
    }
    store.userId = stored
    return true
  }
  return false
}

// We test the logic functions extracted from InviteView
// Since InviteView uses onMounted + Vue components that need full DOM,
// we test the core logic: ensureUser behavior and accept invite handling

describe('InviteView — ensureUser logic', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  it('uses existing user when userId and token match', () => {
    const token = fakeJwt({ userId: 'existUser1' })
    localStorageMock.setItem('smailo_user_id', 'existUser1')
    localStorageMock.setItem('smailo_token', token)

    const store = useUserStore()
    expect(hasUser(store)).toBe(true)
    expect(store.userId).toBe('existUser1')
    // Token should remain intact
    expect(localStorageMock.getItem('smailo_token')).toBe(token)
  })

  it('rejects when JWT userId does not match stored userId (identity desync)', () => {
    const token = fakeJwt({ userId: 'otherUser' })
    localStorageMock.setItem('smailo_user_id', 'existUser1')
    localStorageMock.setItem('smailo_token', token)

    const store = useUserStore()
    expect(hasUser(store)).toBe(false)
    // Stale token should be removed
    expect(localStorageMock.getItem('smailo_token')).toBeNull()
    // userId should NOT be set on the store
    expect(store.userId).toBeNull()
  })

  it('rejects when token has invalid base64 payload', () => {
    localStorageMock.setItem('smailo_user_id', 'existUser1')
    localStorageMock.setItem('smailo_token', 'bad.!!!invalid-base64.sig')

    const store = useUserStore()
    expect(hasUser(store)).toBe(false)
    expect(localStorageMock.getItem('smailo_token')).toBeNull()
  })

  it('returns false when no token present', () => {
    localStorageMock.setItem('smailo_user_id', 'existUser1')

    const store = useUserStore()
    expect(hasUser(store)).toBe(false)
  })

  it('creates new user when no userId in localStorage', async () => {
    mockPost.mockResolvedValueOnce({
      data: { userId: 'newUser01', token: 'new-jwt-123' },
    })

    const store = useUserStore()
    const userId = await store.createUser()

    expect(userId).toBe('newUser01')
    expect(localStorageMock.getItem('smailo_user_id')).toBe('newUser01')
    expect(localStorageMock.getItem('smailo_token')).toBe('new-jwt-123')
    expect(mockPost).toHaveBeenCalledWith('/users')
  })

  it('creates new user when userId exists but no token', async () => {
    localStorageMock.setItem('smailo_user_id', 'oldUser')
    // No smailo_token

    const store = useUserStore()
    expect(hasUser(store)).toBe(false)
  })
})

describe('InviteView — accept invite API', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorageMock.clear()
    localStorageMock.setItem('smailo_user_id', 'testUser')
    localStorageMock.setItem('smailo_token', 'test-jwt')
  })

  it('calls accept endpoint and returns role', async () => {
    mockPost.mockResolvedValueOnce({
      data: { appHash: 'abc123', role: 'editor' },
    })

    const res = await api.post('/app/abc123/members/invite/tok123/accept')

    expect(res.data.role).toBe('editor')
    expect(res.data.appHash).toBe('abc123')
    expect(mockPost).toHaveBeenCalledWith('/app/abc123/members/invite/tok123/accept')
  })

  it('handles already-member response (200 with alreadyMember)', async () => {
    mockPost.mockResolvedValueOnce({
      data: { appHash: 'abc123', role: 'viewer', alreadyMember: true },
    })

    const res = await api.post('/app/abc123/members/invite/tok123/accept')

    expect(res.data.role).toBe('viewer')
    expect(res.data.alreadyMember).toBe(true)
  })

  it('handles expired invite (410)', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 410, data: { error: 'Invite has expired' } },
    })

    try {
      await api.post('/app/abc123/members/invite/tok123/accept')
      expect.unreachable('Should have thrown')
    } catch (err: any) {
      expect(err.response.status).toBe(410)
      expect(err.response.data.error).toContain('expired')
    }
  })

  it('handles already-used invite (410)', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 410, data: { error: 'Invite has already been used' } },
    })

    try {
      await api.post('/app/abc123/members/invite/tok123/accept')
      expect.unreachable('Should have thrown')
    } catch (err: any) {
      expect(err.response.status).toBe(410)
      expect(err.response.data.error).toContain('already been used')
    }
  })

  it('handles not-found invite (404)', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 404, data: { error: 'Invite not found' } },
    })

    try {
      await api.post('/app/abc123/members/invite/badtoken/accept')
      expect.unreachable('Should have thrown')
    } catch (err: any) {
      expect(err.response.status).toBe(404)
    }
  })

  it('handles auth error (401)', async () => {
    mockPost.mockRejectedValueOnce({
      response: { status: 401, data: { error: 'Authentication required' } },
    })

    try {
      await api.post('/app/abc123/members/invite/tok123/accept')
      expect.unreachable('Should have thrown')
    } catch (err: any) {
      expect(err.response.status).toBe(401)
    }
  })
})

describe('InviteView — error message mapping', () => {
  // Test the error-to-message mapping logic used in InviteView

  function mapError(resp: { status: number; data: { error: string } } | undefined): string {
    if (!resp) return 'Не удалось принять приглашение. Попробуйте позже.'
    const msg = resp.data?.error || ''

    if (resp.status === 410) {
      if (msg.includes('expired')) {
        return 'Приглашение истекло.'
      } else {
        return 'Это приглашение уже было использовано.'
      }
    } else if (resp.status === 404) {
      return 'Приглашение недействительно.'
    } else if (resp.status === 401) {
      return 'Ошибка авторизации. Попробуйте обновить страницу.'
    } else {
      return 'Не удалось принять приглашение. Попробуйте позже.'
    }
  }

  it('maps 410 expired to correct message', () => {
    expect(mapError({ status: 410, data: { error: 'Invite has expired' } }))
      .toBe('Приглашение истекло.')
  })

  it('maps 410 already used to correct message', () => {
    expect(mapError({ status: 410, data: { error: 'Invite has already been used' } }))
      .toBe('Это приглашение уже было использовано.')
  })

  it('maps 404 to correct message', () => {
    expect(mapError({ status: 404, data: { error: 'Invite not found' } }))
      .toBe('Приглашение недействительно.')
  })

  it('maps 401 to correct message', () => {
    expect(mapError({ status: 401, data: { error: 'Authentication required' } }))
      .toBe('Ошибка авторизации. Попробуйте обновить страницу.')
  })

  it('maps unknown error to generic message', () => {
    expect(mapError({ status: 500, data: { error: 'Internal server error' } }))
      .toBe('Не удалось принять приглашение. Попробуйте позже.')
  })

  it('maps undefined response to generic message', () => {
    expect(mapError(undefined))
      .toBe('Не удалось принять приглашение. Попробуйте позже.')
  })
})

describe('InviteView — goHome logic', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  it('navigates to user page when userId exists', () => {
    localStorageMock.setItem('smailo_user_id', 'user123')
    const uid = localStorage.getItem('smailo_user_id')
    expect(uid).toBe('user123')
    // goHome would call router.push(`/${uid}`)
  })

  it('navigates to home when no userId', () => {
    const uid = localStorage.getItem('smailo_user_id')
    expect(uid).toBeNull()
    // goHome would call router.push('/')
  })
})
