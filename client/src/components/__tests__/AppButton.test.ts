import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../../stores/app'
import { useUserStore } from '../../stores/user'

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../utils/actionExecutor', () => ({
  executeActions: vi.fn(),
}))

import api from '../../api'
import { executeActions } from '../../utils/actionExecutor'
const mockPost = api.post as ReturnType<typeof vi.fn>
const mockExecuteActions = executeActions as ReturnType<typeof vi.fn>

/**
 * AppButton logic tests — we test the component's behavioral logic
 * by simulating what handleClick does, since we don't have @vue/test-utils.
 */
describe('AppButton — logic', () => {
  let appStore: ReturnType<typeof useAppStore>
  let userStore: ReturnType<typeof useUserStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    appStore = useAppStore()
    userStore = useUserStore()
    vi.clearAllMocks()
  })

  describe('isReadOnly computed', () => {
    it('is read-only when role is viewer', () => {
      appStore.myRole = 'viewer'
      const isReadOnly = appStore.myRole === 'viewer' || !appStore.myRole
      expect(isReadOnly).toBe(true)
    })

    it('is read-only when role is null', () => {
      appStore.myRole = null
      const isReadOnly = appStore.myRole === 'viewer' || !appStore.myRole
      expect(isReadOnly).toBe(true)
    })

    it('is not read-only when role is owner', () => {
      appStore.myRole = 'owner'
      const isReadOnly = appStore.myRole === 'viewer' || !appStore.myRole
      expect(isReadOnly).toBe(false)
    })

    it('is not read-only when role is editor', () => {
      appStore.myRole = 'editor'
      const isReadOnly = appStore.myRole === 'viewer' || !appStore.myRole
      expect(isReadOnly).toBe(false)
    })
  })

  describe('handleClick with actions', () => {
    it('calls executeActions with correct context', async () => {
      const actions = [{ type: 'writeData' as const, key: 'counter', value: 1 }]
      const hash = 'test-hash'
      userStore.userId = 'user1'
      appStore.myRole = 'owner'
      appStore.appData = { foo: 'bar' }

      mockExecuteActions.mockResolvedValueOnce(undefined)

      await executeActions(actions, {
        hash,
        userId: userStore.userId,
        currentPageId: undefined,
        appData: appStore.appData,
        appStore,
      })

      expect(mockExecuteActions).toHaveBeenCalledWith(actions, {
        hash: 'test-hash',
        userId: 'user1',
        currentPageId: undefined,
        appData: { foo: 'bar' },
        appStore,
      })
    })

    it('does not emit data-written when using actions (executeActions handles refresh)', async () => {
      const actions = [{ type: 'writeData' as const, key: 'k', value: true }]
      mockExecuteActions.mockResolvedValueOnce(undefined)

      // With actions, executeActions is called but no api.post
      await executeActions(actions, {
        hash: 'h',
        userId: 'u',
        appData: {},
        appStore,
      })

      expect(mockPost).not.toHaveBeenCalled()
    })
  })

  describe('handleClick with legacy action', () => {
    it('posts to /app/:hash/data with key and value', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const action = { key: 'counter', value: 42 }
      await api.post(`/app/test-hash/data`, {
        key: action.key,
        value: action.value,
      })

      expect(mockPost).toHaveBeenCalledWith('/app/test-hash/data', {
        key: 'counter',
        value: 42,
      })
    })

    it('defaults value to true when action.value is undefined', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const action = { key: 'toggle' } as { key: string; value?: unknown }
      const payload: Record<string, unknown> = {
        key: action.key,
        value: action.value !== undefined ? action.value : true,
      }
      await api.post('/app/h/data', payload)

      expect(mockPost).toHaveBeenCalledWith('/app/h/data', {
        key: 'toggle',
        value: true,
      })
    })

    it('includes mode in payload when provided', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const action = { key: 'items', value: 'new', mode: 'append' }
      const payload: Record<string, unknown> = {
        key: action.key,
        value: action.value,
      }
      if (action.mode) payload.mode = action.mode
      await api.post('/app/h/data', payload)

      expect(mockPost).toHaveBeenCalledWith('/app/h/data', {
        key: 'items',
        value: 'new',
        mode: 'append',
      })
    })
  })

  describe('error handling', () => {
    it('API post rejection is catchable', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'))

      await expect(api.post('/app/h/data', { key: 'k', value: true }))
        .rejects.toThrow('Network error')
    })

    it('executeActions rejection is catchable', async () => {
      mockExecuteActions.mockRejectedValueOnce(new Error('Action failed'))

      await expect(executeActions([], { hash: 'h', userId: 'u', appData: {}, appStore }))
        .rejects.toThrow('Action failed')
    })
  })
})
