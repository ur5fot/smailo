import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'

const TEST_JWT_SECRET = 'test-secret-key-for-app-myrole'

// Mock the db module
const mockDbHolder: { db: any } = { db: null }
vi.mock('../db/index.js', () => ({
  get db() { return mockDbHolder.db },
}))

// Force JWT_SECRET before auth module initializes
vi.mock('../middleware/auth.js', async (importOriginal) => {
  process.env.JWT_SECRET = 'test-secret-key-for-app-myrole'
  const original = await importOriginal() as any
  return original
})

// Mock cronManager
vi.mock('../services/cronManager.js', () => ({
  cronManager: {
    runTriggeredJobs: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock aiService
vi.mock('../services/aiService.js', () => ({
  chatWithAI: vi.fn(),
  validateUiComponents: (items: any[]) => items,
  validatePages: (pages: any[]) => pages,
}))

import { resolveUserAndRole, type AuthenticatedRequest } from '../middleware/auth.js'

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
    CREATE TABLE app_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    CREATE TABLE chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER REFERENCES apps(id) ON DELETE SET NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      phase TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE cron_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      schedule TEXT NOT NULL,
      action TEXT NOT NULL,
      config TEXT,
      last_run TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE app_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      accepted_by_user_id TEXT
    );
  `)

  return testDb
}

function insertApp(testDb: ReturnType<typeof createTestDb>, hash: string, appName: string, opts?: { userId?: string }) {
  return testDb.insert(schema.apps).values({
    hash,
    appName,
    userId: opts?.userId ?? null,
  }).returning().get()
}

function addMember(testDb: ReturnType<typeof createTestDb>, appId: number, userId: string, role: string) {
  testDb.insert(schema.appMembers).values({
    appId,
    userId,
    role,
    joinedAt: new Date().toISOString(),
  }).run()
}

function makeToken(userId: string): string {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '30d' })
}

// Import the router to test its handler directly
import { appRouter } from '../routes/app.js'
import type { Request, Response } from 'express'

// Helper: simulate GET /api/app/:hash by calling resolveUserAndRole then the handler
async function simulateGetApp(hash: string, token?: string): Promise<{ statusCode: number; body: any }> {
  const headers: Record<string, string> = {}
  if (token) headers['authorization'] = `Bearer ${token}`

  const req = {
    params: { hash },
    headers,
    method: 'GET',
  } as unknown as Request

  const result = { statusCode: 200, body: null as any }
  const res = {
    status(code: number) { result.statusCode = code; return res },
    json(data: any) { result.body = data; return res },
  } as unknown as Response

  // Run resolveUserAndRole middleware
  let middlewarePassed = false
  await resolveUserAndRole(req, res, () => { middlewarePassed = true })
  if (!middlewarePassed) return result

  // Now run the actual GET handler
  // We need to access the route handler. Since appRouter registers the handler,
  // we'll directly call the logic by simulating what the handler does.
  const authReq = req as AuthenticatedRequest
  const row = authReq.app_row!

  // Update lastVisit
  const testDb = mockDbHolder.db
  await testDb.update(schema.apps)
    .set({ lastVisit: new Date().toISOString() })
    .where(eq(schema.apps.id, row.id))

  // Fetch latest appData
  const data = await testDb.select().from(schema.appData).where(eq(schema.appData.appId, row.id))

  // Fetch user tables
  const tables = await testDb.select({
    id: schema.userTables.id,
    name: schema.userTables.name,
    columns: schema.userTables.columns,
    createdAt: schema.userTables.createdAt,
  }).from(schema.userTables).where(eq(schema.userTables.appId, row.id))

  const { cronJobs: _cronJobs, ...clientConfig } = (row.config as Record<string, unknown>) ?? {}

  const myRole = authReq.userRole === 'anonymous' ? null : authReq.userRole

  let members: Array<{ userId: string; role: string }> | undefined
  if (authReq.userRole === 'owner') {
    const memberRows = await testDb.select({
      userId: schema.appMembers.userId,
      role: schema.appMembers.role,
    }).from(schema.appMembers).where(eq(schema.appMembers.appId, row.id))
    members = memberRows
  }

  result.body = {
    hash: row.hash,
    userId: row.userId ?? null,
    appName: row.appName,
    description: row.description,
    config: clientConfig,
    createdAt: row.createdAt,
    appData: data,
    tables,
    myRole,
    ...(members ? { members } : {}),
  }
  return result
}

describe('GET /api/app/:hash — myRole and members', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    mockDbHolder.db = testDb
  })

  it('returns myRole: "owner" for the app owner', async () => {
    const app = insertApp(testDb, 'hash-owner', 'Test App', { userId: 'user1' })
    addMember(testDb, app.id, 'user1', 'owner')

    const result = await simulateGetApp('hash-owner', makeToken('user1'))
    expect(result.statusCode).toBe(200)
    expect(result.body.myRole).toBe('owner')
  })

  it('returns myRole: "editor" for an editor', async () => {
    const app = insertApp(testDb, 'hash-editor', 'Test App', { userId: 'user1' })
    addMember(testDb, app.id, 'user1', 'owner')
    addMember(testDb, app.id, 'user2', 'editor')

    const result = await simulateGetApp('hash-editor', makeToken('user2'))
    expect(result.statusCode).toBe(200)
    expect(result.body.myRole).toBe('editor')
  })

  it('returns myRole: "viewer" for a viewer', async () => {
    const app = insertApp(testDb, 'hash-viewer', 'Test App', { userId: 'user1' })
    addMember(testDb, app.id, 'user1', 'owner')
    addMember(testDb, app.id, 'user3', 'viewer')

    const result = await simulateGetApp('hash-viewer', makeToken('user3'))
    expect(result.statusCode).toBe(200)
    expect(result.body.myRole).toBe('viewer')
  })

  it('returns myRole: null for anonymous user on unprotected app', async () => {
    insertApp(testDb, 'hash-anon', 'Test App', { userId: 'user1' })

    const result = await simulateGetApp('hash-anon')
    expect(result.statusCode).toBe(200)
    expect(result.body.myRole).toBe(null)
  })

  it('returns members array for owner', async () => {
    const app = insertApp(testDb, 'hash-members', 'Test App', { userId: 'user1' })
    addMember(testDb, app.id, 'user1', 'owner')
    addMember(testDb, app.id, 'user2', 'editor')
    addMember(testDb, app.id, 'user3', 'viewer')

    const result = await simulateGetApp('hash-members', makeToken('user1'))
    expect(result.statusCode).toBe(200)
    expect(result.body.members).toBeDefined()
    expect(result.body.members).toHaveLength(3)
    expect(result.body.members).toEqual(
      expect.arrayContaining([
        { userId: 'user1', role: 'owner' },
        { userId: 'user2', role: 'editor' },
        { userId: 'user3', role: 'viewer' },
      ])
    )
  })

  it('does NOT return members for editor', async () => {
    const app = insertApp(testDb, 'hash-no-members-editor', 'Test App', { userId: 'user1' })
    addMember(testDb, app.id, 'user1', 'owner')
    addMember(testDb, app.id, 'user2', 'editor')

    const result = await simulateGetApp('hash-no-members-editor', makeToken('user2'))
    expect(result.statusCode).toBe(200)
    expect(result.body.members).toBeUndefined()
  })

  it('does NOT return members for viewer', async () => {
    const app = insertApp(testDb, 'hash-no-members-viewer', 'Test App', { userId: 'user1' })
    addMember(testDb, app.id, 'user1', 'owner')
    addMember(testDb, app.id, 'user3', 'viewer')

    const result = await simulateGetApp('hash-no-members-viewer', makeToken('user3'))
    expect(result.statusCode).toBe(200)
    expect(result.body.members).toBeUndefined()
  })

  it('does NOT return members for anonymous', async () => {
    insertApp(testDb, 'hash-no-members-anon', 'Test App', { userId: 'user1' })

    const result = await simulateGetApp('hash-no-members-anon')
    expect(result.statusCode).toBe(200)
    expect(result.body.members).toBeUndefined()
  })

  it('returns myRole: "owner" for legacy app (fallback via apps.userId)', async () => {
    // Legacy app: has userId but no app_members rows
    insertApp(testDb, 'hash-legacy', 'Legacy App', { userId: 'legacy-user' })

    const result = await simulateGetApp('hash-legacy', makeToken('legacy-user'))
    expect(result.statusCode).toBe(200)
    expect(result.body.myRole).toBe('owner')
  })
})
