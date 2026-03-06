import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, desc, and, ne } from 'drizzle-orm'
import * as schema from '../db/schema.js'

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

describe('GET /api/users/:userId/apps — shared apps query', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()

    // Create users
    db.insert(schema.users).values({ userId: 'owner1' }).run()
    db.insert(schema.users).values({ userId: 'member1' }).run()

    // Create apps owned by owner1
    db.insert(schema.apps).values({ hash: 'app1hash', userId: 'owner1', appName: 'App 1', description: 'desc1' }).run()
    db.insert(schema.apps).values({ hash: 'app2hash', userId: 'owner1', appName: 'App 2', description: 'desc2' }).run()

    // owner1 is owner in app_members
    const [app1] = db.select().from(schema.apps).where(eq(schema.apps.hash, 'app1hash')).all()
    const [app2] = db.select().from(schema.apps).where(eq(schema.apps.hash, 'app2hash')).all()

    db.insert(schema.appMembers).values({ appId: app1.id, userId: 'owner1', role: 'owner', joinedAt: new Date().toISOString() }).run()
    db.insert(schema.appMembers).values({ appId: app2.id, userId: 'owner1', role: 'owner', joinedAt: new Date().toISOString() }).run()

    // member1 is editor in app1, viewer in app2
    db.insert(schema.appMembers).values({ appId: app1.id, userId: 'member1', role: 'editor', joinedAt: new Date().toISOString() }).run()
    db.insert(schema.appMembers).values({ appId: app2.id, userId: 'member1', role: 'viewer', joinedAt: new Date().toISOString() }).run()
  })

  it('returns own apps for owner', () => {
    const ownApps = db
      .select({
        hash: schema.apps.hash,
        appName: schema.apps.appName,
        description: schema.apps.description,
      })
      .from(schema.apps)
      .where(eq(schema.apps.userId, 'owner1'))
      .orderBy(desc(schema.apps.createdAt))
      .all()

    expect(ownApps).toHaveLength(2)
    expect(ownApps.map(a => a.hash)).toContain('app1hash')
    expect(ownApps.map(a => a.hash)).toContain('app2hash')
  })

  it('returns shared apps for member (excluding owner role)', () => {
    const shared = db
      .select({
        hash: schema.apps.hash,
        appName: schema.apps.appName,
        role: schema.appMembers.role,
      })
      .from(schema.appMembers)
      .innerJoin(schema.apps, eq(schema.appMembers.appId, schema.apps.id))
      .where(and(
        eq(schema.appMembers.userId, 'member1'),
        ne(schema.appMembers.role, 'owner'),
      ))
      .all()

    expect(shared).toHaveLength(2)

    const app1 = shared.find(a => a.hash === 'app1hash')
    expect(app1?.role).toBe('editor')

    const app2 = shared.find(a => a.hash === 'app2hash')
    expect(app2?.role).toBe('viewer')
  })

  it('returns no shared apps for owner (owner role is excluded)', () => {
    const shared = db
      .select({
        hash: schema.apps.hash,
        role: schema.appMembers.role,
      })
      .from(schema.appMembers)
      .innerJoin(schema.apps, eq(schema.appMembers.appId, schema.apps.id))
      .where(and(
        eq(schema.appMembers.userId, 'owner1'),
        ne(schema.appMembers.role, 'owner'),
      ))
      .all()

    expect(shared).toHaveLength(0)
  })

  it('returns empty arrays for user with no apps', () => {
    db.insert(schema.users).values({ userId: 'lonely' }).run()

    const own = db
      .select({ hash: schema.apps.hash })
      .from(schema.apps)
      .where(eq(schema.apps.userId, 'lonely'))
      .all()

    const shared = db
      .select({ hash: schema.apps.hash })
      .from(schema.appMembers)
      .innerJoin(schema.apps, eq(schema.appMembers.appId, schema.apps.id))
      .where(and(
        eq(schema.appMembers.userId, 'lonely'),
        ne(schema.appMembers.role, 'owner'),
      ))
      .all()

    expect(own).toHaveLength(0)
    expect(shared).toHaveLength(0)
  })

  it('does not duplicate apps when user is both owner in apps table and member', () => {
    // owner1 owns both apps in apps.userId AND has owner role in app_members
    // The query should not return them in the shared list
    const shared = db
      .select({ hash: schema.apps.hash, role: schema.appMembers.role })
      .from(schema.appMembers)
      .innerJoin(schema.apps, eq(schema.appMembers.appId, schema.apps.id))
      .where(and(
        eq(schema.appMembers.userId, 'owner1'),
        ne(schema.appMembers.role, 'owner'),
      ))
      .all()

    expect(shared).toHaveLength(0)
  })
})
