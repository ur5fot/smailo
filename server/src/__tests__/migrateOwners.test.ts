import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import * as schema from '../db/schema.js'

// Mock the db module to use our test database
const mockDb = { value: null as ReturnType<typeof drizzle> | null }
vi.mock('../db/index.js', () => ({
  get db() { return mockDb.value }
}))

// Import after mock setup
const { migrateOwnerRecords } = await import('../db/migrateOwners.js')

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })

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
  `)

  return db
}

describe('migrateOwnerRecords', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    mockDb.value = testDb
  })

  it('creates owner records for apps with userId but no owner in app_members', () => {
    // Create two apps with userId
    testDb.insert(schema.apps).values({ hash: 'hash1', userId: 'user1', appName: 'App1' }).run()
    testDb.insert(schema.apps).values({ hash: 'hash2', userId: 'user2', appName: 'App2' }).run()

    const migrated = migrateOwnerRecords()

    expect(migrated).toBe(2)
    const members = testDb.select().from(schema.appMembers).all()
    expect(members).toHaveLength(2)
    expect(members[0].role).toBe('owner')
    expect(members[0].userId).toBe('user1')
    expect(members[1].role).toBe('owner')
    expect(members[1].userId).toBe('user2')
  })

  it('skips legacy apps without userId', () => {
    // Legacy app without userId
    testDb.insert(schema.apps).values({ hash: 'hash1', appName: 'Legacy' }).run()
    // Normal app with userId
    testDb.insert(schema.apps).values({ hash: 'hash2', userId: 'user1', appName: 'Normal' }).run()

    const migrated = migrateOwnerRecords()

    expect(migrated).toBe(1)
    const members = testDb.select().from(schema.appMembers).all()
    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe('user1')
  })

  it('is idempotent — does not create duplicates on repeated runs', () => {
    testDb.insert(schema.apps).values({ hash: 'hash1', userId: 'user1', appName: 'App1' }).run()

    const first = migrateOwnerRecords()
    expect(first).toBe(1)

    const second = migrateOwnerRecords()
    expect(second).toBe(0)

    const members = testDb.select().from(schema.appMembers).all()
    expect(members).toHaveLength(1)
  })

  it('skips apps that already have an owner in app_members', () => {
    const [app] = testDb.insert(schema.apps).values({ hash: 'hash1', userId: 'user1', appName: 'App1' }).returning({ id: schema.apps.id }).all()
    testDb.insert(schema.appMembers).values({
      appId: app.id,
      userId: 'user1',
      role: 'owner',
      joinedAt: new Date().toISOString(),
    }).run()

    const migrated = migrateOwnerRecords()
    expect(migrated).toBe(0)

    const members = testDb.select().from(schema.appMembers).all()
    expect(members).toHaveLength(1)
  })

  it('creates owner even when app has non-owner members', () => {
    const [app] = testDb.insert(schema.apps).values({ hash: 'hash1', userId: 'user1', appName: 'App1' }).returning({ id: schema.apps.id }).all()
    // Add an editor but no owner
    testDb.insert(schema.appMembers).values({
      appId: app.id,
      userId: 'user2',
      role: 'editor',
      joinedAt: new Date().toISOString(),
    }).run()

    const migrated = migrateOwnerRecords()
    expect(migrated).toBe(1)

    const members = testDb.select().from(schema.appMembers).all()
    expect(members).toHaveLength(2)
    const owner = members.find(m => m.role === 'owner')
    expect(owner).toBeDefined()
    expect(owner!.userId).toBe('user1')
  })

  it('returns 0 when there are no apps', () => {
    const migrated = migrateOwnerRecords()
    expect(migrated).toBe(0)
  })
})
