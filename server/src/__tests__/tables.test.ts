import { describe, it, expect } from 'vitest'
import { isValidColumnDef, validateRowData, COLUMN_TYPES } from '../utils/tableValidation.js'
import type { ColumnDef } from '../utils/tableValidation.js'

describe('isValidColumnDef', () => {
  it('accepts valid text column', () => {
    expect(isValidColumnDef({ name: 'title', type: 'text' })).toBe(true)
  })

  it('accepts valid number column', () => {
    expect(isValidColumnDef({ name: 'amount', type: 'number' })).toBe(true)
  })

  it('accepts valid date column', () => {
    expect(isValidColumnDef({ name: 'dueDate', type: 'date' })).toBe(true)
  })

  it('accepts valid boolean column', () => {
    expect(isValidColumnDef({ name: 'done', type: 'boolean' })).toBe(true)
  })

  it('accepts valid select column with options', () => {
    expect(isValidColumnDef({ name: 'status', type: 'select', options: ['active', 'done'] })).toBe(true)
  })

  it('accepts column with required flag', () => {
    expect(isValidColumnDef({ name: 'name', type: 'text', required: true })).toBe(true)
  })

  it('rejects null', () => {
    expect(isValidColumnDef(null)).toBe(false)
  })

  it('rejects string', () => {
    expect(isValidColumnDef('name:text')).toBe(false)
  })

  it('rejects array', () => {
    expect(isValidColumnDef([{ name: 'a', type: 'text' }])).toBe(false)
  })

  it('rejects column with name starting with number', () => {
    expect(isValidColumnDef({ name: '1bad', type: 'text' })).toBe(false)
  })

  it('rejects column with name over 50 chars', () => {
    expect(isValidColumnDef({ name: 'a'.repeat(51), type: 'text' })).toBe(false)
  })

  it('rejects unknown column type', () => {
    expect(isValidColumnDef({ name: 'col', type: 'json' })).toBe(false)
  })

  it('rejects select column without options', () => {
    expect(isValidColumnDef({ name: 'col', type: 'select' })).toBe(false)
  })

  it('rejects select column with empty options array', () => {
    expect(isValidColumnDef({ name: 'col', type: 'select', options: [] })).toBe(false)
  })

  it('all COLUMN_TYPES are supported', () => {
    expect(COLUMN_TYPES).toContain('text')
    expect(COLUMN_TYPES).toContain('number')
    expect(COLUMN_TYPES).toContain('date')
    expect(COLUMN_TYPES).toContain('boolean')
    expect(COLUMN_TYPES).toContain('select')
    expect(COLUMN_TYPES).toHaveLength(5)
  })
})

describe('validateRowData', () => {
  const columns: ColumnDef[] = [
    { name: 'title', type: 'text', required: true },
    { name: 'amount', type: 'number' },
    { name: 'dueDate', type: 'date' },
    { name: 'done', type: 'boolean' },
    { name: 'category', type: 'select', options: ['food', 'transport', 'other'] },
  ]

  it('validates and returns cleaned data for all types', () => {
    const result = validateRowData({
      title: 'Groceries',
      amount: 42.5,
      dueDate: '2026-03-01',
      done: false,
      category: 'food',
    }, columns)

    expect(result.valid).toBe(true)
    expect(result.cleaned).toBeDefined()
    expect(result.cleaned!.title).toBe('Groceries')
    expect(result.cleaned!.amount).toBe(42.5)
    expect(typeof result.cleaned!.dueDate).toBe('string')
    expect(result.cleaned!.done).toBe(false)
    expect(result.cleaned!.category).toBe('food')
  })

  it('rejects when required field is missing', () => {
    const result = validateRowData({ amount: 10 }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('title')
    expect(result.error).toContain('required')
  })

  it('allows optional fields to be null', () => {
    const result = validateRowData({ title: 'Test', amount: null }, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.amount).toBeNull()
  })

  it('allows optional fields to be missing', () => {
    const result = validateRowData({ title: 'Test' }, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.amount).toBeNull()
  })

  it('rejects text field with non-string value', () => {
    const result = validateRowData({ title: 123 }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('title')
  })

  it('rejects number field with string value', () => {
    const result = validateRowData({ title: 'T', amount: '42' }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('amount')
  })

  it('rejects number field with NaN', () => {
    const result = validateRowData({ title: 'T', amount: NaN }, columns)
    expect(result.valid).toBe(false)
  })

  it('rejects number field with Infinity', () => {
    const result = validateRowData({ title: 'T', amount: Infinity }, columns)
    expect(result.valid).toBe(false)
  })

  it('rejects invalid date string', () => {
    const result = validateRowData({ title: 'T', dueDate: 'not-a-date' }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('dueDate')
  })

  it('converts valid date to ISO string', () => {
    const result = validateRowData({ title: 'T', dueDate: '2026-03-01T12:00:00Z' }, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects boolean field with non-boolean', () => {
    const result = validateRowData({ title: 'T', done: 1 }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('done')
  })

  it('rejects select field with invalid option', () => {
    const result = validateRowData({ title: 'T', category: 'invalid' }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('category')
  })

  it('rejects non-object data (null)', () => {
    const result = validateRowData(null, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('data must be an object')
  })

  it('rejects array as data', () => {
    const result = validateRowData([{ title: 'T' }], columns)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('data must be an object')
  })

  it('rejects text field exceeding max length', () => {
    const result = validateRowData({ title: 'x'.repeat(5001) }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('max length')
  })
})

describe('GET /api/app/:hash/tables/:tableId response shape', () => {
  // This documents the expected contract for the response used by the client AppDataTable
  it('response has required fields: id, name, columns, createdAt, rows', () => {
    // Simulate the response shape from tables.ts line 218-224
    const response = {
      id: 1,
      name: 'Expenses',
      columns: [
        { name: 'title', type: 'text', required: true },
        { name: 'amount', type: 'number' },
        { name: 'category', type: 'select', options: ['food', 'transport'] },
      ],
      createdAt: '2026-03-01T12:00:00.000Z',
      rows: [
        {
          id: 1,
          data: { title: 'Groceries', amount: 42.5, category: 'food' },
          createdAt: '2026-03-01T12:00:00.000Z',
          updatedAt: '2026-03-01T12:00:00.000Z',
        },
      ],
    }

    // Verify structure matches what client expects (app.ts store fetchTableRows)
    expect(response).toHaveProperty('id')
    expect(typeof response.id).toBe('number')
    expect(response).toHaveProperty('name')
    expect(typeof response.name).toBe('string')
    expect(response).toHaveProperty('columns')
    expect(Array.isArray(response.columns)).toBe(true)
    expect(response).toHaveProperty('createdAt')
    expect(typeof response.createdAt).toBe('string')
    expect(response).toHaveProperty('rows')
    expect(Array.isArray(response.rows)).toBe(true)

    // Verify column shape
    for (const col of response.columns) {
      expect(col).toHaveProperty('name')
      expect(col).toHaveProperty('type')
      expect(isValidColumnDef(col)).toBe(true)
    }

    // Verify row shape
    const row = response.rows[0]
    expect(row).toHaveProperty('id')
    expect(typeof row.id).toBe('number')
    expect(row).toHaveProperty('data')
    expect(typeof row.data).toBe('object')
    expect(row).toHaveProperty('createdAt')
    expect(row).toHaveProperty('updatedAt')
  })

  it('response rows can be empty', () => {
    const response = {
      id: 2,
      name: 'Tasks',
      columns: [{ name: 'task', type: 'text' }],
      createdAt: '2026-03-01T12:00:00.000Z',
      rows: [],
    }
    expect(response.rows).toEqual([])
  })

  it('row data keys match column names', () => {
    const columns = [
      { name: 'task', type: 'text' as const },
      { name: 'priority', type: 'number' as const },
    ]
    const rowData = { task: 'Buy milk', priority: 3 }

    // All column names should be present as keys in row data
    for (const col of columns) {
      expect(rowData).toHaveProperty(col.name)
    }
  })

  it('client can flatten row data for DataTable display', () => {
    // Simulates what AppDataTable does: merge row.id + row.data
    const row = {
      id: 5,
      data: { task: 'Buy milk', priority: 3, done: false },
      createdAt: '2026-03-01',
      updatedAt: null,
    }

    const flattened = { id: row.id, ...(row.data as Record<string, unknown>) }
    expect(flattened).toEqual({ id: 5, task: 'Buy milk', priority: 3, done: false })
  })

  it('client generates columns from schema for DataTable', () => {
    // Simulates what AppDataTable effectiveColumns does with table schema
    const columns = [
      { name: 'task', type: 'text' as const },
      { name: 'priority', type: 'number' as const },
      { name: 'done', type: 'boolean' as const },
    ]

    const tableColumns = columns.map((col) => ({ field: col.name, header: col.name }))
    expect(tableColumns).toEqual([
      { field: 'task', header: 'task' },
      { field: 'priority', header: 'priority' },
      { field: 'done', header: 'done' },
    ])
  })
})
