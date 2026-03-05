import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, sql } from 'drizzle-orm'
import * as schema from '../db/schema.js'

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
      password_version INTEGER DEFAULT 0,
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

describe('Row-Level Security (RLS) — table rows', () => {
  let testDb: ReturnType<typeof createTestDb>
  let appId: number
  let rlsTableId: number
  let normalTableId: number
  let ownerRow1Id: number
  let viewer1Row1Id: number
  let viewer1Row2Id: number
  let viewer2Row1Id: number

  beforeEach(() => {
    testDb = createTestDb()

    // Create app
    const app = testDb.insert(schema.apps).values({
      hash: 'rls-test-hash',
      appName: 'RLS Test App',
      userId: 'owner1',
    }).returning().get()
    appId = app.id

    // Create RLS-enabled table
    const rlsTable = testDb.insert(schema.userTables).values({
      appId,
      name: 'tasks',
      columns: JSON.stringify([
        { name: 'title', type: 'text' },
        { name: 'done', type: 'boolean' },
      ]),
      rlsEnabled: 1,
    }).returning().get()
    rlsTableId = rlsTable.id

    // Create normal table (RLS disabled)
    const normalTable = testDb.insert(schema.userTables).values({
      appId,
      name: 'settings',
      columns: JSON.stringify([
        { name: 'key', type: 'text' },
        { name: 'value', type: 'text' },
      ]),
      rlsEnabled: 0,
    }).returning().get()
    normalTableId = normalTable.id

    // Insert rows from different users into RLS table
    const r1 = testDb.insert(schema.userRows).values({
      tableId: rlsTableId,
      data: JSON.stringify({ title: 'Owner task', done: false }),
      createdByUserId: 'owner1',
    }).returning().get()
    ownerRow1Id = r1.id

    const r2 = testDb.insert(schema.userRows).values({
      tableId: rlsTableId,
      data: JSON.stringify({ title: 'Viewer1 task A', done: false }),
      createdByUserId: 'viewer1',
    }).returning().get()
    viewer1Row1Id = r2.id

    const r3 = testDb.insert(schema.userRows).values({
      tableId: rlsTableId,
      data: JSON.stringify({ title: 'Viewer1 task B', done: true }),
      createdByUserId: 'viewer1',
    }).returning().get()
    viewer1Row2Id = r3.id

    const r4 = testDb.insert(schema.userRows).values({
      tableId: rlsTableId,
      data: JSON.stringify({ title: 'Viewer2 task', done: false }),
      createdByUserId: 'viewer2',
    }).returning().get()
    viewer2Row1Id = r4.id

    // Insert rows into normal table
    testDb.insert(schema.userRows).values([
      { tableId: normalTableId, data: JSON.stringify({ key: 'theme', value: 'dark' }), createdByUserId: 'owner1' },
      { tableId: normalTableId, data: JSON.stringify({ key: 'lang', value: 'en' }), createdByUserId: 'viewer1' },
    ]).run()
  })

  // Helper: mimics the RLS filtering logic from GET /:tableId
  function fetchRowsWithRls(
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

    return testDb.select().from(schema.userRows).where(rowFilter).all()
  }

  describe('GET /:tableId — read filtering', () => {
    it('owner sees all rows in RLS-enabled table', () => {
      const rows = fetchRowsWithRls(rlsTableId, 1, 'owner', 'owner1')
      expect(rows).toHaveLength(4)
    })

    it('editor sees all rows in RLS-enabled table', () => {
      const rows = fetchRowsWithRls(rlsTableId, 1, 'editor', 'editor1')
      expect(rows).toHaveLength(4)
    })

    it('viewer sees only own rows in RLS-enabled table', () => {
      const rows = fetchRowsWithRls(rlsTableId, 1, 'viewer', 'viewer1')
      expect(rows).toHaveLength(2)
      expect(rows.every(r => r.createdByUserId === 'viewer1')).toBe(true)
    })

    it('viewer2 sees only their own rows', () => {
      const rows = fetchRowsWithRls(rlsTableId, 1, 'viewer', 'viewer2')
      expect(rows).toHaveLength(1)
      expect(rows[0].createdByUserId).toBe('viewer2')
    })

    it('anonymous sees no rows in RLS-enabled table', () => {
      const rows = fetchRowsWithRls(rlsTableId, 1, 'anonymous', undefined)
      expect(rows).toHaveLength(0)
    })

    it('anonymous with no userId sees no rows', () => {
      const rows = fetchRowsWithRls(rlsTableId, 1, 'anonymous')
      expect(rows).toHaveLength(0)
    })

    it('viewer sees all rows when RLS is disabled', () => {
      const rows = fetchRowsWithRls(normalTableId, 0, 'viewer', 'viewer1')
      expect(rows).toHaveLength(2) // all rows in normal table
    })

    it('anonymous sees all rows when RLS is disabled', () => {
      const rows = fetchRowsWithRls(normalTableId, 0, 'anonymous', undefined)
      expect(rows).toHaveLength(2)
    })

    it('viewer with no rows of their own gets empty result', () => {
      const rows = fetchRowsWithRls(rlsTableId, 1, 'viewer', 'nobody')
      expect(rows).toHaveLength(0)
    })
  })

  describe('POST /:tableId/rows — createdByUserId recording', () => {
    it('records createdByUserId when inserting a row', () => {
      const inserted = testDb.insert(schema.userRows).values({
        tableId: rlsTableId,
        data: JSON.stringify({ title: 'New task', done: false }),
        createdByUserId: 'editor1',
      }).returning().get()

      expect(inserted.createdByUserId).toBe('editor1')
    })

    it('allows null createdByUserId for backward compatibility', () => {
      const inserted = testDb.insert(schema.userRows).values({
        tableId: rlsTableId,
        data: JSON.stringify({ title: 'Legacy task', done: false }),
        createdByUserId: null,
      }).returning().get()

      expect(inserted.createdByUserId).toBeNull()
    })
  })

  describe('PUT /:tableId/rows/:rowId — viewer ownership check', () => {
    // Simulates the RLS ownership logic for row updates
    function canViewerUpdateRow(
      rlsEnabled: number | null,
      rowCreatedByUserId: string | null,
      viewerUserId: string,
    ): { allowed: boolean; reason?: string } {
      if (rlsEnabled !== 1) {
        return { allowed: false, reason: 'Viewer cannot update rows in non-RLS table' }
      }
      if (rowCreatedByUserId !== viewerUserId) {
        return { allowed: false, reason: 'Viewer can only update own rows' }
      }
      return { allowed: true }
    }

    it('viewer can update own row in RLS table', () => {
      const result = canViewerUpdateRow(1, 'viewer1', 'viewer1')
      expect(result.allowed).toBe(true)
    })

    it('viewer cannot update another user\'s row in RLS table', () => {
      const result = canViewerUpdateRow(1, 'owner1', 'viewer1')
      expect(result.allowed).toBe(false)
    })

    it('viewer cannot update row in non-RLS table', () => {
      const result = canViewerUpdateRow(0, 'viewer1', 'viewer1')
      expect(result.allowed).toBe(false)
    })

    it('viewer cannot update row with null createdByUserId', () => {
      const result = canViewerUpdateRow(1, null, 'viewer1')
      expect(result.allowed).toBe(false)
    })
  })

  describe('DELETE /:tableId/rows/:rowId — viewer ownership check', () => {
    function canViewerDeleteRow(
      rlsEnabled: number | null,
      rowCreatedByUserId: string | null,
      viewerUserId: string,
    ): { allowed: boolean; reason?: string } {
      if (rlsEnabled !== 1) {
        return { allowed: false, reason: 'Viewer cannot delete rows in non-RLS table' }
      }
      if (rowCreatedByUserId !== viewerUserId) {
        return { allowed: false, reason: 'Viewer can only delete own rows' }
      }
      return { allowed: true }
    }

    it('viewer can delete own row in RLS table', () => {
      const result = canViewerDeleteRow(1, 'viewer1', 'viewer1')
      expect(result.allowed).toBe(true)
    })

    it('viewer cannot delete another user\'s row in RLS table', () => {
      const result = canViewerDeleteRow(1, 'owner1', 'viewer1')
      expect(result.allowed).toBe(false)
    })

    it('viewer cannot delete row in non-RLS table', () => {
      const result = canViewerDeleteRow(0, 'viewer1', 'viewer1')
      expect(result.allowed).toBe(false)
    })

    it('viewer cannot delete row with null createdByUserId', () => {
      const result = canViewerDeleteRow(1, null, 'viewer1')
      expect(result.allowed).toBe(false)
    })
  })

  describe('PUT /:tableId — rlsEnabled toggle', () => {
    it('can enable RLS on a table', () => {
      testDb.update(schema.userTables)
        .set({ rlsEnabled: 1 })
        .where(eq(schema.userTables.id, normalTableId))
        .run()

      const [table] = testDb.select().from(schema.userTables)
        .where(eq(schema.userTables.id, normalTableId)).all()
      expect(table.rlsEnabled).toBe(1)
    })

    it('can disable RLS on a table', () => {
      testDb.update(schema.userTables)
        .set({ rlsEnabled: 0 })
        .where(eq(schema.userTables.id, rlsTableId))
        .run()

      const [table] = testDb.select().from(schema.userTables)
        .where(eq(schema.userTables.id, rlsTableId)).all()
      expect(table.rlsEnabled).toBe(0)
    })

    it('disabling RLS makes viewer see all rows', () => {
      // Before: viewer sees only own rows
      let rows = fetchRowsWithRls(rlsTableId, 1, 'viewer', 'viewer1')
      expect(rows).toHaveLength(2)

      // Disable RLS
      testDb.update(schema.userTables)
        .set({ rlsEnabled: 0 })
        .where(eq(schema.userTables.id, rlsTableId))
        .run()

      // After: viewer sees all rows
      rows = fetchRowsWithRls(rlsTableId, 0, 'viewer', 'viewer1')
      expect(rows).toHaveLength(4)
    })

    it('enabling RLS restricts viewer to own rows', () => {
      // Normal table: viewer sees all
      let rows = fetchRowsWithRls(normalTableId, 0, 'viewer', 'viewer1')
      expect(rows).toHaveLength(2)

      // Enable RLS
      testDb.update(schema.userTables)
        .set({ rlsEnabled: 1 })
        .where(eq(schema.userTables.id, normalTableId))
        .run()

      // After: viewer sees only own
      rows = fetchRowsWithRls(normalTableId, 1, 'viewer', 'viewer1')
      expect(rows).toHaveLength(1)
      expect(rows[0].createdByUserId).toBe('viewer1')
    })
  })

  describe('edge cases', () => {
    it('rows without createdByUserId are invisible to viewers in RLS table', () => {
      // Insert a legacy row without createdByUserId
      testDb.insert(schema.userRows).values({
        tableId: rlsTableId,
        data: JSON.stringify({ title: 'Legacy', done: false }),
        createdByUserId: null,
      }).run()

      // Viewer cannot see legacy rows (null !== 'viewer1')
      const rows = fetchRowsWithRls(rlsTableId, 1, 'viewer', 'viewer1')
      expect(rows).toHaveLength(2) // only viewer1's rows, not the legacy one
    })

    it('owner still sees rows without createdByUserId', () => {
      testDb.insert(schema.userRows).values({
        tableId: rlsTableId,
        data: JSON.stringify({ title: 'Legacy', done: false }),
        createdByUserId: null,
      }).run()

      const rows = fetchRowsWithRls(rlsTableId, 1, 'owner', 'owner1')
      expect(rows).toHaveLength(5) // all 4 + legacy
    })
  })
})
