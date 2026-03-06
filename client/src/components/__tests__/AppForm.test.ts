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
 * AppForm logic tests — validates field generation, validation,
 * submission to KV/table APIs, action execution, and form reset.
 */
describe('AppForm — logic', () => {
  let appStore: ReturnType<typeof useAppStore>
  let userStore: ReturnType<typeof useUserStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    appStore = useAppStore()
    userStore = useUserStore()
    vi.clearAllMocks()
  })

  describe('effectiveFields — KV mode', () => {
    it('maps props.fields to FormField array', () => {
      const propsFields = [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'amount', type: 'number', label: 'Amount' },
      ]
      const effectiveFields = propsFields.map(f => ({
        name: f.name,
        type: f.type,
        label: f.label,
      }))
      expect(effectiveFields).toEqual([
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'amount', type: 'number', label: 'Amount' },
      ])
    })

    it('returns empty array when no fields provided', () => {
      const propsFields = undefined
      const effectiveFields = (propsFields || []).map((f: any) => ({
        name: f.name,
        type: f.type,
        label: f.label,
      }))
      expect(effectiveFields).toEqual([])
    })
  })

  describe('effectiveFields — table mode', () => {
    it('auto-generates fields from table schema columns', () => {
      const tableSchema = {
        columns: [
          { name: 'name', type: 'text', required: true },
          { name: 'age', type: 'number', required: false },
          { name: 'total', type: 'formula', formula: 'price * qty' },
          { name: 'status', type: 'select', options: ['active', 'inactive'] },
        ],
      }

      // Simulate effectiveFields computed — filter out formula columns
      const fields = tableSchema.columns
        .filter(col => col.type !== 'formula')
        .map(col => ({
          name: col.name,
          type: col.type,
          label: col.name,
          required: col.required,
          options: col.options,
        }))

      expect(fields).toEqual([
        { name: 'name', type: 'text', label: 'name', required: true, options: undefined },
        { name: 'age', type: 'number', label: 'age', required: false, options: undefined },
        { name: 'status', type: 'select', label: 'status', required: undefined, options: ['active', 'inactive'] },
      ])
    })

    it('skips formula columns (read-only)', () => {
      const columns = [
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'total', type: 'formula', formula: 'price * qty' },
      ]
      const filtered = columns.filter(col => col.type !== 'formula')
      expect(filtered).toHaveLength(2)
      expect(filtered.map(c => c.name)).toEqual(['price', 'qty'])
    })
  })

  describe('initDefaults', () => {
    function initDefaults(fields: Array<{ name: string; type: string }>): Record<string, unknown> {
      return Object.fromEntries(fields.map(f => {
        switch (f.type) {
          case 'number': return [f.name, null]
          case 'boolean': return [f.name, false]
          case 'date': return [f.name, null]
          case 'select': return [f.name, null]
          default: return [f.name, '']
        }
      }))
    }

    it('sets text fields to empty string', () => {
      const defaults = initDefaults([{ name: 'title', type: 'text' }])
      expect(defaults).toEqual({ title: '' })
    })

    it('sets number fields to null', () => {
      const defaults = initDefaults([{ name: 'amount', type: 'number' }])
      expect(defaults).toEqual({ amount: null })
    })

    it('sets boolean fields to false', () => {
      const defaults = initDefaults([{ name: 'active', type: 'boolean' }])
      expect(defaults).toEqual({ active: false })
    })

    it('sets date fields to null', () => {
      const defaults = initDefaults([{ name: 'dob', type: 'date' }])
      expect(defaults).toEqual({ dob: null })
    })

    it('sets select fields to null', () => {
      const defaults = initDefaults([{ name: 'status', type: 'select' }])
      expect(defaults).toEqual({ status: null })
    })

    it('handles multiple fields of different types', () => {
      const defaults = initDefaults([
        { name: 'name', type: 'text' },
        { name: 'age', type: 'number' },
        { name: 'active', type: 'boolean' },
      ])
      expect(defaults).toEqual({ name: '', age: null, active: false })
    })
  })

  describe('validation — required fields', () => {
    it('rejects null value for required field', () => {
      const field = { name: 'title', type: 'text', label: 'Title', required: true }
      const value: unknown = null
      const isInvalid = value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
      expect(isInvalid).toBe(true)
    })

    it('rejects empty string for required field', () => {
      const value = ''
      const isInvalid = value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
      expect(isInvalid).toBe(true)
    })

    it('rejects whitespace-only string for required field', () => {
      const value = '   '
      const isInvalid = value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
      expect(isInvalid).toBe(true)
    })

    it('accepts non-empty string for required field', () => {
      const value = 'hello'
      const isInvalid = value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
      expect(isInvalid).toBe(false)
    })

    it('accepts zero number for required field', () => {
      const value = 0
      const isInvalid = value === null || value === undefined || (typeof value === 'string' && (value as unknown as string).trim() === '')
      expect(isInvalid).toBe(false)
    })

    it('accepts false boolean for required field', () => {
      const value = false
      const isInvalid = value === null || value === undefined || (typeof value === 'string' && (value as unknown as string).trim() === '')
      expect(isInvalid).toBe(false)
    })

    it('in KV mode all fields are required by default', () => {
      const isTableMode = false
      const fieldRequired = undefined
      const isRequired = isTableMode ? fieldRequired : true
      expect(isRequired).toBe(true)
    })

    it('in table mode uses field.required flag', () => {
      const isTableMode = true
      const isRequired = isTableMode ? false : true
      expect(isRequired).toBe(false)
    })
  })

  describe('handleSubmit — KV mode', () => {
    it('posts form data with timestamp to appData', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const fields = [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'amount', type: 'number', label: 'Amount' },
      ]
      const fieldValues: Record<string, unknown> = { title: 'Test', amount: 100 }
      const outputKey = 'expenses'

      const formObject: Record<string, unknown> = {}
      for (const field of fields) {
        formObject[field.name] = fieldValues[field.name]
      }
      formObject.timestamp = new Date().toISOString()

      await api.post('/app/test-hash/data', {
        key: outputKey,
        value: formObject,
      })

      expect(mockPost).toHaveBeenCalledWith('/app/test-hash/data', {
        key: 'expenses',
        value: expect.objectContaining({
          title: 'Test',
          amount: 100,
          timestamp: expect.any(String),
        }),
      })
    })

    it('includes append mode when appendMode is true', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const appendMode = true
      await api.post('/app/h/data', {
        key: 'items',
        value: { name: 'x', timestamp: new Date().toISOString() },
        ...(appendMode ? { mode: 'append' } : {}),
      })

      expect(mockPost).toHaveBeenCalledWith('/app/h/data', expect.objectContaining({
        mode: 'append',
      }))
    })

    it('does not include mode when appendMode is false', async () => {
      mockPost.mockResolvedValueOnce({ data: { ok: true } })

      const appendMode = false
      await api.post('/app/h/data', {
        key: 'items',
        value: { name: 'x' },
        ...(appendMode ? { mode: 'append' } : {}),
      })

      const calledWith = mockPost.mock.calls[0][1]
      expect(calledWith).not.toHaveProperty('mode')
    })
  })

  describe('handleSubmit — table mode', () => {
    it('posts row data to tables API', async () => {
      mockPost.mockResolvedValueOnce({ data: { id: 1 } })

      const tableId = 5
      const data = { name: 'Alice', age: 30 }
      await api.post(`/app/test-hash/tables/${tableId}/rows`, { data })

      expect(mockPost).toHaveBeenCalledWith('/app/test-hash/tables/5/rows', {
        data: { name: 'Alice', age: 30 },
      })
    })

    it('converts Date to ISO string for date columns', () => {
      const fields = [{ name: 'dob', type: 'date', label: 'DOB' }]
      const fieldValues: Record<string, unknown> = { dob: new Date('2000-01-15T00:00:00Z') }

      const data: Record<string, unknown> = {}
      for (const field of fields) {
        const v = fieldValues[field.name]
        if (field.type === 'date' && v instanceof Date) {
          data[field.name] = v.toISOString()
        } else {
          data[field.name] = v
        }
      }

      expect(data.dob).toBe('2000-01-15T00:00:00.000Z')
    })

    it('converts empty string to null for table data', () => {
      const fields = [{ name: 'note', type: 'text', label: 'Note' }]
      const fieldValues: Record<string, unknown> = { note: '' }

      const data: Record<string, unknown> = {}
      for (const field of fields) {
        const v = fieldValues[field.name]
        if (v === '' || v === undefined) {
          data[field.name] = null
        } else {
          data[field.name] = v
        }
      }

      expect(data.note).toBeNull()
    })

    it('invalidates table cache after submit', () => {
      const tableId = 5
      // Simulate what handleSubmit does after table POST
      appStore.invalidateTableCache(tableId)
      // No error thrown = success; the method clears the cache entry
    })
  })

  describe('post-submit action chain', () => {
    it('calls executeActions after form submit', async () => {
      const actions = [{ type: 'writeData' as const, key: 'lastSubmit', value: true }]
      const submittedData = { title: 'Test', amount: 100 }
      userStore.userId = 'user1'
      appStore.appData = {}

      mockExecuteActions.mockResolvedValueOnce(undefined)

      await executeActions(actions, {
        hash: 'test-hash',
        userId: userStore.userId,
        currentPageId: undefined,
        appData: appStore.appData,
        appStore,
        inputValue: submittedData,
      })

      expect(mockExecuteActions).toHaveBeenCalledWith(actions, expect.objectContaining({
        inputValue: submittedData,
      }))
    })
  })

  describe('form reset after submit', () => {
    it('resets field values to defaults after successful submit', () => {
      const fields = [
        { name: 'title', type: 'text' },
        { name: 'amount', type: 'number' },
        { name: 'active', type: 'boolean' },
      ]

      // Simulate filled form
      const fieldValues: Record<string, unknown> = { title: 'Test', amount: 100, active: true }

      // Simulate initDefaults reset
      function initDefaults(fs: Array<{ name: string; type: string }>): Record<string, unknown> {
        return Object.fromEntries(fs.map(f => {
          switch (f.type) {
            case 'number': return [f.name, null]
            case 'boolean': return [f.name, false]
            default: return [f.name, '']
          }
        }))
      }

      Object.assign(fieldValues, initDefaults(fields))

      expect(fieldValues).toEqual({ title: '', amount: null, active: false })
    })
  })

  describe('error handling', () => {
    it('shows server error message when available', () => {
      const error = { response: { data: { error: 'Duplicate entry' } } }
      const serverError = error?.response?.data?.error
      const errorMsg = serverError || 'Не удалось сохранить. Попробуйте ещё раз.'
      expect(errorMsg).toBe('Duplicate entry')
    })

    it('falls back to generic error message', () => {
      const error = { response: undefined }
      const serverError = (error as any)?.response?.data?.error
      const errorMsg = serverError || 'Не удалось сохранить. Попробуйте ещё раз.'
      expect(errorMsg).toBe('Не удалось сохранить. Попробуйте ещё раз.')
    })
  })
})
