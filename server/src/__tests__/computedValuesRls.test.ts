import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, sql } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { evaluateComputedValues } from '../utils/computedValues.js'
import { evaluateFormulaColumns } from '../utils/formulaColumns.js'
import type { UiComponent } from '../services/aiService.js'
import type { ColumnDef } from '../utils/tableValidation.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const testDb = drizzle(sqlite, { schema })

  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      user_id TEXT,
      password_hash TEXT,
      creation_token TEXT,
      app_name TEXT NOT NULL,
      description TEXT,
      config TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_visit TEXT
    );
    CREATE TABLE app_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      UNIQUE(app_id, user_id)
    );
    CREATE TABLE user_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      columns TEXT NOT NULL,
      rls_enabled INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE user_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES user_tables(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT
    );
  `)

  return testDb
}

/**
 * Mimics the RLS-aware row fetching logic from GET /api/app/:hash/data.
 * This is the exact filtering logic used in the route handler.
 */
async function fetchTableRowsWithRls(
  db: ReturnType<typeof createTestDb>,
  tableId: number,
  rlsEnabled: number | null,
  userRole: string,
  userId?: string,
) {
  const isRlsRestricted = (userRole === 'viewer' || userRole === 'anonymous') && rlsEnabled === 1
  const rowFilter = isRlsRestricted
    ? (userId
      ? and(eq(schema.userRows.tableId, tableId), eq(schema.userRows.createdByUserId, userId))
      : and(eq(schema.userRows.tableId, tableId), sql`0`))
    : eq(schema.userRows.tableId, tableId)

  return db.select({
    id: schema.userRows.id,
    data: schema.userRows.data,
    createdAt: schema.userRows.createdAt,
    updatedAt: schema.userRows.updatedAt,
  }).from(schema.userRows).where(rowFilter)
}

describe('computedValues + RLS guard', () => {
  let testDb: ReturnType<typeof createTestDb>
  let appId: number
  let tableId: number

  beforeEach(() => {
    testDb = createTestDb()

    // Create app and owner
    const app = testDb.insert(schema.apps).values({
      hash: 'test-hash-rls',
      appName: 'RLS Test App',
      userId: 'owner123',
    }).returning().get()
    appId = app.id

    // Create RLS-enabled table
    const table = testDb.insert(schema.userTables).values({
      appId,
      name: 'expenses',
      columns: JSON.stringify([
        { name: 'amount', type: 'number' },
        { name: 'category', type: 'text' },
      ]),
      rlsEnabled: 1,
    }).returning().get()
    tableId = table.id

    // Add rows from different users
    testDb.insert(schema.userRows).values([
      { tableId, data: JSON.stringify({ amount: 100, category: 'food' }), createdByUserId: 'viewer1' },
      { tableId, data: JSON.stringify({ amount: 200, category: 'transport' }), createdByUserId: 'viewer2' },
      { tableId, data: JSON.stringify({ amount: 50, category: 'food' }), createdByUserId: 'viewer1' },
      { tableId, data: JSON.stringify({ amount: 300, category: 'rent' }), createdByUserId: 'owner123' },
    ]).run()
  })

  it('owner sees all rows — SUM includes everything', async () => {
    const rows = await fetchTableRowsWithRls(testDb, tableId, 1, 'owner', 'owner123')
    expect(rows).toHaveLength(4)

    const tablesContext = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: rows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>),
      },
    }
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
    ]
    const result = evaluateComputedValues(components, tablesContext)
    expect(result[0]).toBe(650)
  })

  it('editor sees all rows — SUM includes everything', async () => {
    const rows = await fetchTableRowsWithRls(testDb, tableId, 1, 'editor', 'editor456')
    expect(rows).toHaveLength(4)

    const tablesContext = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: rows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>),
      },
    }
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
    ]
    const result = evaluateComputedValues(components, tablesContext)
    expect(result[0]).toBe(650)
  })

  it('viewer sees only own rows — SUM is limited to their data', async () => {
    const rows = await fetchTableRowsWithRls(testDb, tableId, 1, 'viewer', 'viewer1')
    expect(rows).toHaveLength(2)

    const tablesContext = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: rows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>),
      },
    }
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
    ]
    const result = evaluateComputedValues(components, tablesContext)
    expect(result[0]).toBe(150) // 100 + 50, viewer1's rows only
  })

  it('viewer2 sees only their own rows', async () => {
    const rows = await fetchTableRowsWithRls(testDb, tableId, 1, 'viewer', 'viewer2')
    expect(rows).toHaveLength(1)

    const tablesContext = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: rows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>),
      },
    }
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
      { component: 'Card', props: {}, computedValue: 'COUNT(expenses)' },
    ]
    const result = evaluateComputedValues(components, tablesContext)
    expect(result[0]).toBe(200) // viewer2 has only one row with amount=200
    expect(result[1]).toBe(1)
  })

  it('anonymous sees no rows from RLS-enabled table', async () => {
    const rows = await fetchTableRowsWithRls(testDb, tableId, 1, 'anonymous', undefined)
    expect(rows).toHaveLength(0)

    const tablesContext = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: [],
      },
    }
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'COUNT(expenses)' },
    ]
    const result = evaluateComputedValues(components, tablesContext)
    expect(result[0]).toBe(0)
  })

  it('viewer sees all rows when RLS is disabled', async () => {
    // Disable RLS on the table
    testDb.update(schema.userTables).set({ rlsEnabled: 0 }).where(eq(schema.userTables.id, tableId)).run()

    const rows = await fetchTableRowsWithRls(testDb, tableId, 0, 'viewer', 'viewer1')
    expect(rows).toHaveLength(4) // all rows visible

    const tablesContext = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: rows.map(r => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as Record<string, unknown>),
      },
    }
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
    ]
    const result = evaluateComputedValues(components, tablesContext)
    expect(result[0]).toBe(650)
  })

  it('viewer with no rows of their own gets empty result', async () => {
    const rows = await fetchTableRowsWithRls(testDb, tableId, 1, 'viewer', 'viewer_with_no_data')
    expect(rows).toHaveLength(0)

    const tablesContext = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: [],
      },
    }
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
      { component: 'Card', props: {}, computedValue: 'AVG(expenses.amount)' },
    ]
    const result = evaluateComputedValues(components, tablesContext)
    // SUM of empty returns null, COUNT returns 0
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
  })
})
