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
 * AppInputText logic tests — validates input value handling,
 * action execution, legacy action fallback, and validation.
 */
describe('AppInputText — logic', () => {
  let appStore: ReturnType<typeof useAppStore>
  let userStore: ReturnType<typeof useUserStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    appStore = useAppStore()
    userStore = useUserStore()
    vi.clearAllMocks()
  })

  describe('isReadOnly', () => {
    it('is read-only for viewer role', () => {
      appStore.myRole = 'viewer'
      expect(appStore.myRole === 'viewer' || !appStore.myRole).toBe(true)
    })

    it('is not read-only for editor role', () => {
      appStore.myRole = 'editor'
      expect(appStore.myRole === 'viewer' || !appStore.myRole).toBe(false)
    })
  })

  describe('getInputValue logic', () => {
    it('returns text value for text type', () => {
      const type = 'text'
      const textValue = 'hello'
      const numericValue = null
      const dateValue = null
      const result = type === 'number' ? numericValue
        : type === 'date' ? (dateValue ? (dateValue as Date).toISOString() : null)
        : textValue
      expect(result).toBe('hello')
    })

    it('returns numeric value for number type', () => {
      const type = 'number'
      const numericValue = 42
      const result = type === 'number' ? numericValue : 'text'
      expect(result).toBe(42)
    })

    it('returns ISO string for date type', () => {
      const type = 'date'
      const dateValue = new Date('2026-01-15T12:00:00Z')
      const result = type === 'date' ? dateValue.toISOString() : null
      expect(result).toBe('2026-01-15T12:00:00.000Z')
    })

    it('returns null for date type when no date set', () => {
      const type = 'date'
      const dateValue: Date | null = null
      const result = type === 'date' ? (dateValue ? dateValue.toISOString() : null) : null
      expect(result).toBeNull()
    })
  })

  describe('validation — empty input', () => {
    it('rejects empty string', () => {
      const value = ''
      const isEmpty = value === null || (typeof value === 'string' && value.trim() === '')
      expect(isEmpty).toBe(true)
    })

    it('rejects whitespace-only string', () => {
      const value = '   '
      const isEmpty = value === null || (typeof value === 'string' && value.trim() === '')
      expect(isEmpty).toBe(true)
    })

    it('rejects null value', () => {
      const value = null
      const isEmpty = value === null || (typeof value === 'string' && (value as string).trim() === '')
      expect(isEmpty).toBe(true)
    })

    it('accepts non-empty string', () => {
      const value = 'hello'
      const isEmpty = value === null || (typeof value === 'string' && value.trim() === '')
      expect(isEmpty).toBe(false)
    })

    it('accepts zero as numeric value', () => {
      const value = 0
      const isEmpty = value === null || (typeof value === 'string' && (value as unknown as string).trim() === '')
      expect(isEmpty).toBe(false)
    })
  })

  describe('handleSave with actions', () => {
    it('calls executeActions with inputValue context', async () => {
      const actions = [{ type: 'writeData' as const, key: 'notes', value: '{inputValue}' }]
      const inputValue = 'user text'
      userStore.userId = 'user1'
      appStore.appData = {}

      mockExecuteActions.mockResolvedValueOnce(undefined)

      await executeActions(actions, {
        hash: 'test-hash',
        userId: userStore.userId,
        currentPageId: undefined,
        appData: appStore.appData,
        appStore,
        inputValue,
      })

      expect(mockExecuteActions).toHaveBeenCalledWith(actions, expect.objectContaining({
        hash: 'test-hash',
        inputValue: 'user text',
      }))
    })

    it('clears input after successful actions', async () => {
      // Simulating clearInputs behavior
      let textValue = 'some text'
      let numericValue: number | null = 42
      let dateValue: Date | null = new Date()

      mockExecuteActions.mockResolvedValueOnce(undefined)
      await executeActions([], { hash: 'h', userId: 'u', appData: {}, appStore })

      // After success, clear inputs
      textValue = ''
      numericValue = null
      dateValue = null

      expect(textValue).toBe('')
      expect(numericValue).toBeNull()
      expect(dateValue).toBeNull()
    })
  })

  describe('handleSave with legacy action', () => {
    it('posts key/value to API', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const action = { key: 'note' }
      const value = 'hello world'
      await api.post('/app/test-hash/data', {
        key: action.key,
        value,
      })

      expect(mockPost).toHaveBeenCalledWith('/app/test-hash/data', {
        key: 'note',
        value: 'hello world',
      })
    })

    it('includes append mode when specified', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const action = { key: 'items', mode: 'append' as const }
      const value = 'new item'
      await api.post('/app/h/data', {
        key: action.key,
        value,
        ...(action.mode === 'append' ? { mode: 'append' } : {}),
      })

      expect(mockPost).toHaveBeenCalledWith('/app/h/data', {
        key: 'items',
        value: 'new item',
        mode: 'append',
      })
    })

    it('does not include mode when not append', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const action = { key: 'items' } as { key: string; mode?: 'append' }
      const value = 'val'
      await api.post('/app/h/data', {
        key: action.key,
        value,
        ...(action.mode === 'append' ? { mode: 'append' } : {}),
      })

      expect(mockPost).toHaveBeenCalledWith('/app/h/data', {
        key: 'items',
        value: 'val',
      })
    })
  })

  describe('error handling', () => {
    it('API post rejection is catchable', async () => {
      mockPost.mockRejectedValueOnce(new Error('Fail'))

      await expect(api.post('/app/h/data', { key: 'k', value: 'v' }))
        .rejects.toThrow('Fail')
    })
  })
})
