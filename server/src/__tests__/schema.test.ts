import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })

  // Create tables manually (drizzle-kit push doesn't work with in-memory)
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
      app_id INTEGER NOT NULL REFERENCES apps(id),
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
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `)

  return db
}

function insertApp(db: ReturnType<typeof createTestDb>, hash: string, appName: string, userId?: string) {
  return db.insert(schema.apps).values({
    hash,
    appName,
    userId: userId ?? null,
  }).returning().get()
}

describe('app_members schema', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('inserts and reads an app_member', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')

    db.insert(schema.appMembers).values({
      appId: app.id,
      userId: 'user1',
      role: 'owner',
      joinedAt: new Date().toISOString(),
    }).run()

    const members = db.select().from(schema.appMembers).where(eq(schema.appMembers.appId, app.id)).all()
    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe('user1')
    expect(members[0].role).toBe('owner')
  })

  it('allows multiple members for the same app with different userIds', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')
    const now = new Date().toISOString()

    db.insert(schema.appMembers).values([
      { appId: app.id, userId: 'user1', role: 'owner', joinedAt: now },
      { appId: app.id, userId: 'user2', role: 'editor', joinedAt: now },
      { appId: app.id, userId: 'user3', role: 'viewer', joinedAt: now },
    ]).run()

    const members = db.select().from(schema.appMembers).where(eq(schema.appMembers.appId, app.id)).all()
    expect(members).toHaveLength(3)
    expect(members.map(m => m.role).sort()).toEqual(['editor', 'owner', 'viewer'])
  })

  it('enforces unique constraint on (appId, userId)', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')
    const now = new Date().toISOString()

    db.insert(schema.appMembers).values({
      appId: app.id,
      userId: 'user1',
      role: 'owner',
      joinedAt: now,
    }).run()

    expect(() => {
      db.insert(schema.appMembers).values({
        appId: app.id,
        userId: 'user1',
        role: 'editor',
        joinedAt: now,
      }).run()
    }).toThrow()
  })

  it('allows same userId in different apps', () => {
    const app1 = insertApp(db, 'hash1', 'App 1', 'user1')
    const app2 = insertApp(db, 'hash2', 'App 2', 'user1')
    const now = new Date().toISOString()

    db.insert(schema.appMembers).values([
      { appId: app1.id, userId: 'user1', role: 'owner', joinedAt: now },
      { appId: app2.id, userId: 'user1', role: 'editor', joinedAt: now },
    ]).run()

    const allMembers = db.select().from(schema.appMembers).all()
    expect(allMembers).toHaveLength(2)
  })

  it('cascade deletes members when app is deleted', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')
    const now = new Date().toISOString()

    db.insert(schema.appMembers).values([
      { appId: app.id, userId: 'user1', role: 'owner', joinedAt: now },
      { appId: app.id, userId: 'user2', role: 'viewer', joinedAt: now },
    ]).run()

    // Verify members exist
    expect(db.select().from(schema.appMembers).all()).toHaveLength(2)

    // Delete app
    db.delete(schema.apps).where(eq(schema.apps.id, app.id)).run()

    // Members should be cascade deleted
    expect(db.select().from(schema.appMembers).all()).toHaveLength(0)
  })
})

describe('user_rows.createdByUserId', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('stores and reads createdByUserId', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')

    db.insert(schema.userTables).values({
      appId: app.id,
      name: 'tasks',
      columns: JSON.stringify([{ name: 'title', type: 'text' }]),
    }).run()

    const table = db.select().from(schema.userTables).all()[0]

    db.insert(schema.userRows).values({
      tableId: table.id,
      data: JSON.stringify({ title: 'Task 1' }),
      createdByUserId: 'user2',
    }).run()

    const rows = db.select().from(schema.userRows).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].createdByUserId).toBe('user2')
  })

  it('allows null createdByUserId for backward compat', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')

    db.insert(schema.userTables).values({
      appId: app.id,
      name: 'tasks',
      columns: JSON.stringify([{ name: 'title', type: 'text' }]),
    }).run()

    const table = db.select().from(schema.userTables).all()[0]

    db.insert(schema.userRows).values({
      tableId: table.id,
      data: JSON.stringify({ title: 'Task 1' }),
    }).run()

    const rows = db.select().from(schema.userRows).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].createdByUserId).toBeNull()
  })
})

describe('user_tables.rlsEnabled', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('defaults rlsEnabled to 0', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')

    db.insert(schema.userTables).values({
      appId: app.id,
      name: 'tasks',
      columns: JSON.stringify([{ name: 'title', type: 'text' }]),
    }).run()

    const tables = db.select().from(schema.userTables).all()
    expect(tables).toHaveLength(1)
    expect(tables[0].rlsEnabled).toBe(0)
  })

  it('stores rlsEnabled = 1', () => {
    const app = insertApp(db, 'abc123', 'Test App', 'user1')

    db.insert(schema.userTables).values({
      appId: app.id,
      name: 'tasks',
      columns: JSON.stringify([{ name: 'title', type: 'text' }]),
      rlsEnabled: 1,
    }).run()

    const tables = db.select().from(schema.userTables).all()
    expect(tables[0].rlsEnabled).toBe(1)
  })
})
