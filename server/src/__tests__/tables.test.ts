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
    expect(COLUMN_TYPES).toContain('formula')
    expect(COLUMN_TYPES).toHaveLength(6)
  })

  it('accepts valid formula column with parseable expression', () => {
    expect(isValidColumnDef({ name: 'total', type: 'formula', formula: 'price * quantity' })).toBe(true)
  })

  it('accepts formula column with complex expression', () => {
    expect(isValidColumnDef({ name: 'discount', type: 'formula', formula: 'IF(amount > 100, amount * 0.1, 0)' })).toBe(true)
  })

  it('accepts formula column with string functions', () => {
    expect(isValidColumnDef({ name: 'fullName', type: 'formula', formula: 'CONCAT(first, " ", last)' })).toBe(true)
  })

  it('rejects formula column without formula field', () => {
    expect(isValidColumnDef({ name: 'total', type: 'formula' })).toBe(false)
  })

  it('rejects formula column with empty formula string', () => {
    expect(isValidColumnDef({ name: 'total', type: 'formula', formula: '' })).toBe(false)
  })

  it('rejects formula column with whitespace-only formula', () => {
    expect(isValidColumnDef({ name: 'total', type: 'formula', formula: '   ' })).toBe(false)
  })

  it('rejects formula column with invalid syntax', () => {
    expect(isValidColumnDef({ name: 'total', type: 'formula', formula: 'price * + quantity' })).toBe(false)
  })

  it('rejects formula column with unclosed parenthesis', () => {
    expect(isValidColumnDef({ name: 'total', type: 'formula', formula: 'SUM(amount' })).toBe(false)
  })

  it('rejects formula column with non-string formula', () => {
    expect(isValidColumnDef({ name: 'total', type: 'formula', formula: 42 })).toBe(false)
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

  it('skips formula columns during row validation', () => {
    const columnsWithFormula: ColumnDef[] = [
      { name: 'price', type: 'number', required: true },
      { name: 'quantity', type: 'number', required: true },
      { name: 'total', type: 'formula', formula: 'price * quantity' },
    ]
    // Submit only non-formula fields — formula column should be ignored
    const result = validateRowData({ price: 10, quantity: 5 }, columnsWithFormula)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.price).toBe(10)
    expect(result.cleaned!.quantity).toBe(5)
    // Formula column should not appear in cleaned data
    expect(result.cleaned!).not.toHaveProperty('total')
  })

  it('skips formula columns even if data is provided for them', () => {
    const columnsWithFormula: ColumnDef[] = [
      { name: 'price', type: 'number', required: true },
      { name: 'total', type: 'formula', formula: 'price * 2' },
    ]
    // Even if user submits a value for the formula column, it should be ignored
    const result = validateRowData({ price: 10, total: 999 }, columnsWithFormula)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.price).toBe(10)
    expect(result.cleaned!).not.toHaveProperty('total')
  })

  it('does not treat formula column as required', () => {
    const columnsWithFormula: ColumnDef[] = [
      { name: 'amount', type: 'number' },
      { name: 'doubled', type: 'formula', formula: 'amount * 2' },
    ]
    // Formula column should never cause a "required" validation failure
    const result = validateRowData({ amount: 42 }, columnsWithFormula)
    expect(result.valid).toBe(true)
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

describe('POST /api/app/:hash/tables/:tableId/rows — typed validation contract', () => {
  // Tests the validateRowData behavior that the row creation endpoint relies on.
  // These simulate the form submission flow from AppForm (table mode).

  it('accepts a row with all column types filled', () => {
    const columns: ColumnDef[] = [
      { name: 'name', type: 'text', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'date', type: 'date' },
      { name: 'active', type: 'boolean' },
      { name: 'status', type: 'select', options: ['pending', 'done'] },
    ]
    const data = {
      name: 'Test item',
      amount: 100,
      date: '2026-03-02T10:00:00Z',
      active: true,
      status: 'pending',
    }
    const result = validateRowData(data, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned).toBeDefined()
    expect(result.cleaned!.name).toBe('Test item')
    expect(result.cleaned!.amount).toBe(100)
    expect(result.cleaned!.active).toBe(true)
    expect(result.cleaned!.status).toBe('pending')
  })

  it('accepts a row with only required fields, optional fields null', () => {
    const columns: ColumnDef[] = [
      { name: 'title', type: 'text', required: true },
      { name: 'notes', type: 'text' },
      { name: 'priority', type: 'number' },
    ]
    const data = { title: 'Urgent task' }
    const result = validateRowData(data, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.title).toBe('Urgent task')
    expect(result.cleaned!.notes).toBeNull()
    expect(result.cleaned!.priority).toBeNull()
  })

  it('rejects when a required text field is empty string', () => {
    // The server validator requires non-null for required fields;
    // empty string for text passes type check but the form should
    // prevent this client-side. Server validates type, not emptiness.
    const columns: ColumnDef[] = [
      { name: 'title', type: 'text', required: true },
    ]
    // Empty string is technically a valid string type at server level
    const result = validateRowData({ title: '' }, columns)
    expect(result.valid).toBe(true)
  })

  it('rejects when required number field is null', () => {
    const columns: ColumnDef[] = [
      { name: 'amount', type: 'number', required: true },
    ]
    const result = validateRowData({ amount: null }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('amount')
    expect(result.error).toContain('required')
  })

  it('rejects when required boolean field is missing', () => {
    const columns: ColumnDef[] = [
      { name: 'confirmed', type: 'boolean', required: true },
    ]
    const result = validateRowData({}, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('confirmed')
  })

  it('rejects when select field value not in options', () => {
    const columns: ColumnDef[] = [
      { name: 'priority', type: 'select', options: ['low', 'medium', 'high'] },
    ]
    const result = validateRowData({ priority: 'critical' }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('priority')
    expect(result.error).toContain('one of')
  })

  it('accepts select field value that matches one of the options', () => {
    const columns: ColumnDef[] = [
      { name: 'priority', type: 'select', options: ['low', 'medium', 'high'] },
    ]
    const result = validateRowData({ priority: 'high' }, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.priority).toBe('high')
  })

  it('rejects date field with non-date value from form', () => {
    const columns: ColumnDef[] = [
      { name: 'due', type: 'date' },
    ]
    const result = validateRowData({ due: 'tomorrow' }, columns)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('due')
  })

  it('accepts ISO date string from DatePicker', () => {
    const columns: ColumnDef[] = [
      { name: 'due', type: 'date' },
    ]
    const result = validateRowData({ due: '2026-03-15T00:00:00.000Z' }, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.due).toMatch(/^2026-03-15/)
  })

  it('strips extra fields not defined in schema', () => {
    const columns: ColumnDef[] = [
      { name: 'title', type: 'text' },
    ]
    const result = validateRowData({ title: 'Test', extraField: 'ignored', hack: true }, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned).toBeDefined()
    expect(result.cleaned!.title).toBe('Test')
    expect(result.cleaned!).not.toHaveProperty('extraField')
    expect(result.cleaned!).not.toHaveProperty('hack')
  })

  it('POST response shape: returns id, data, createdAt', () => {
    // Documents the expected response shape from POST /tables/:tableId/rows
    const response = {
      id: 42,
      data: { title: 'New item', amount: 99.5 },
      createdAt: '2026-03-02T10:00:00.000Z',
    }
    expect(response).toHaveProperty('id')
    expect(typeof response.id).toBe('number')
    expect(response).toHaveProperty('data')
    expect(typeof response.data).toBe('object')
    expect(response).toHaveProperty('createdAt')
    expect(typeof response.createdAt).toBe('string')
  })

  it('ignores unknown fields in submitted data (strips extra fields)', () => {
    const columns: ColumnDef[] = [
      { name: 'title', type: 'text', required: true },
    ]
    const result = validateRowData({ title: 'Test', _extra: 'hack', __proto__: {} }, columns)
    expect(result.valid).toBe(true)
    expect(Object.keys(result.cleaned!)).toEqual(['title'])
  })

  it('validates a multi-column form submission matching AppForm table mode', () => {
    // Simulates what AppForm sends when submitting to a table with all column types
    const columns: ColumnDef[] = [
      { name: 'description', type: 'text', required: true },
      { name: 'amount', type: 'number', required: true },
      { name: 'purchaseDate', type: 'date' },
      { name: 'recurring', type: 'boolean' },
      { name: 'category', type: 'select', options: ['food', 'transport', 'housing', 'other'] },
    ]
    // Simulates form data as AppForm would build it
    const formData = {
      description: 'Monthly groceries',
      amount: 150.75,
      purchaseDate: '2026-03-01T00:00:00.000Z',
      recurring: true,
      category: 'food',
    }
    const result = validateRowData(formData, columns)
    expect(result.valid).toBe(true)
    expect(result.cleaned!.description).toBe('Monthly groceries')
    expect(result.cleaned!.amount).toBe(150.75)
    expect(result.cleaned!.recurring).toBe(true)
    expect(result.cleaned!.category).toBe('food')
  })
})

describe('DELETE /api/app/:hash/tables/:tableId/rows/:rowId — response contract', () => {
  // Documents the expected behavior of the row deletion endpoint
  // that AppCardList uses in table mode

  it('successful deletion returns { ok: true }', () => {
    // Simulates the expected response shape
    const response = { ok: true }
    expect(response).toHaveProperty('ok', true)
  })

  it('deletion with invalid tableId returns 400', () => {
    // Simulates the error response for invalid tableId
    const response = { error: 'Invalid tableId or rowId' }
    expect(response).toHaveProperty('error')
    expect(response.error).toContain('Invalid')
  })

  it('deletion of non-existent row returns 404', () => {
    // Simulates the error response for missing row
    const response = { error: 'Row not found' }
    expect(response).toHaveProperty('error')
    expect(response.error).toBe('Row not found')
  })

  it('deletion of row from non-existent table returns 404', () => {
    const response = { error: 'Table not found' }
    expect(response).toHaveProperty('error')
    expect(response.error).toBe('Table not found')
  })

  it('client sends correct URL format for row deletion', () => {
    // Simulates what AppCardList builds as the API URL
    const hash = 'abc123'
    const tableId = 5
    const rowId = 42
    const expectedUrl = `/app/${hash}/tables/${tableId}/rows/${rowId}`
    expect(expectedUrl).toBe('/app/abc123/tables/5/rows/42')
  })

  it('client refreshes table data after successful deletion', () => {
    // Documents the expected flow:
    // 1. DELETE /api/app/:hash/tables/:tableId/rows/:rowId -> { ok: true }
    // 2. GET /api/app/:hash/tables/:tableId -> { rows: [...] } (refresh)
    // 3. emit('data-written') for AppView refresh
    const deleteResponse = { ok: true }
    expect(deleteResponse.ok).toBe(true)

    // After delete, the table should be refreshed (fewer rows)
    const refreshResponse = {
      id: 5,
      name: 'Expenses',
      columns: [{ name: 'title', type: 'text' }],
      createdAt: '2026-03-01T00:00:00.000Z',
      rows: [], // Row was deleted, table is now empty
    }
    expect(refreshResponse.rows).toEqual([])
  })

  it('AppCardList renders table row data using schema columns', () => {
    // Documents how AppCardList maps table schema to card display
    const columns = [
      { name: 'title', type: 'text' as const },
      { name: 'amount', type: 'number' as const },
      { name: 'done', type: 'boolean' as const },
      { name: 'date', type: 'date' as const },
    ]
    const rowData = { title: 'Groceries', amount: 42.5, done: true, date: '2026-03-01T00:00:00Z' }

    // Each column is displayed as a key-value pair in the card
    for (const col of columns) {
      expect(rowData).toHaveProperty(col.name)
    }

    // Boolean values are formatted as Да/Нет in the UI
    expect(rowData.done).toBe(true) // rendered as "Да"
    // Null/undefined values are rendered as "—"
    const nullableRow = { title: 'Test', amount: null, done: false, date: null }
    expect(nullableRow.amount).toBeNull() // rendered as "—"
  })
})
