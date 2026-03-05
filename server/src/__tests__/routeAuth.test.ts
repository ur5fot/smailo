import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { Request, Response, NextFunction } from 'express'
import * as schema from '../db/schema.js'

const TEST_JWT_SECRET = 'test-secret-key-for-route-auth'

// Mock the db module
const mockDbHolder: { db: any } = { db: null }
vi.mock('../db/index.js', () => ({
  get db() { return mockDbHolder.db },
}))

// Force JWT_SECRET before auth module initializes
vi.mock('../middleware/auth.js', async (importOriginal) => {
  process.env.JWT_SECRET = 'test-secret-key-for-route-auth'
  const original = await importOriginal() as any
  return original
})

import { resolveUserAndRole, requireRole } from '../middleware/auth.js'
import type { AuthenticatedRequest, UserRole } from '../middleware/auth.js'

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
  `)

  return testDb
}

function insertApp(testDb: ReturnType<typeof createTestDb>, hash: string, appName: string, opts?: { userId?: string; passwordHash?: string }) {
  return testDb.insert(schema.apps).values({
    hash,
    appName,
    userId: opts?.userId ?? null,
    passwordHash: opts?.passwordHash ?? null,
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

function mockReq(hash: string, opts?: { token?: string; method?: string }): Request {
  const headers: Record<string, string> = {}
  if (opts?.token) {
    headers['authorization'] = `Bearer ${opts.token}`
  }
  return {
    params: { hash },
    headers,
    method: opts?.method ?? 'GET',
  } as unknown as Request
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as any,
    status(code: number) { res.statusCode = code; return res },
    json(data: any) { res.body = data; return res },
  }
  return res as unknown as Response & { statusCode: number; body: any }
}

/** Helper: run resolveUserAndRole + requireRole pipeline */
async function runAuth(
  req: Request,
  res: Response,
  ...roles: UserRole[]
): Promise<boolean> {
  let passed = false
  const next1: NextFunction = () => { passed = true }

  await resolveUserAndRole(req, res, next1)
  if (!passed) return false

  if (roles.length > 0) {
    passed = false
    const next2: NextFunction = () => { passed = true }
    requireRole(...roles)(req, res, next2)
  }

  return passed
}

describe('Route auth: app.ts endpoints', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    mockDbHolder.db = testDb
  })

  describe('GET /:hash (read app — any authenticated, anonymous OK for unprotected)', () => {
    it('allows owner', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      const req = mockReq('h1', { token: makeToken('u1') })
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('owner')
    })

    it('allows editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2') })
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('editor')
    })

    it('allows viewer', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1') })
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('viewer')
    })

    it('allows anonymous for unprotected app', async () => {
      insertApp(testDb, 'h1', 'App')
      const req = mockReq('h1')
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })

    it('blocks anonymous for password-protected app', async () => {
      insertApp(testDb, 'h1', 'App', { passwordHash: '$2a$12$fake' })
      const req = mockReq('h1')
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(false)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /:hash/data (write data — editor+)', () => {
    const roles: UserRole[] = ['editor', 'owner']

    it('allows owner', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      const req = mockReq('h1', { token: makeToken('u1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('allows editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('blocks viewer', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })

    it('blocks anonymous', async () => {
      insertApp(testDb, 'h1', 'App')
      const req = mockReq('h1', { method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('PUT /:hash/config (owner only)', () => {
    const roles: UserRole[] = ['owner']

    it('allows owner', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      const req = mockReq('h1', { token: makeToken('u1'), method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('blocks editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })

    it('blocks viewer', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /:hash/set-password (owner only)', () => {
    const roles: UserRole[] = ['owner']

    it('allows owner', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      const req = mockReq('h1', { token: makeToken('u1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('blocks editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /:hash/chat (editor+ but editor cannot change config)', () => {
    const roles: UserRole[] = ['editor', 'owner']

    it('allows owner', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      const req = mockReq('h1', { token: makeToken('u1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('allows editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('editor')
    })

    it('blocks viewer', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /:hash/actions/fetch-url (editor+)', () => {
    const roles: UserRole[] = ['editor', 'owner']

    it('allows editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('blocks viewer', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('backward compatibility — legacy apps without app_members', () => {
    it('owner (via apps.userId match) can write data', async () => {
      insertApp(testDb, 'h1', 'App', { userId: 'creator1' })
      const req = mockReq('h1', { token: makeToken('creator1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, 'editor', 'owner')).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('owner')
    })

    it('owner (via apps.userId match) can update config', async () => {
      insertApp(testDb, 'h1', 'App', { userId: 'creator1' })
      const req = mockReq('h1', { token: makeToken('creator1'), method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, 'owner')).toBe(true)
    })

    it('non-creator gets anonymous on unprotected legacy app', async () => {
      insertApp(testDb, 'h1', 'App', { userId: 'creator1' })
      const req = mockReq('h1', { token: makeToken('other') })
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })

    it('non-creator is blocked from writing on legacy app', async () => {
      insertApp(testDb, 'h1', 'App', { userId: 'creator1' })
      const req = mockReq('h1', { token: makeToken('other'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, 'editor', 'owner')).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })
})

describe('Route auth: tables.ts endpoints', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    mockDbHolder.db = testDb
  })

  describe('GET /tables (list tables — any role)', () => {
    it('allows anonymous for unprotected app', async () => {
      insertApp(testDb, 'h1', 'App')
      const req = mockReq('h1')
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(true)
    })

    it('allows viewer', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1') })
      const res = mockRes()
      expect(await runAuth(req, res)).toBe(true)
    })
  })

  describe('POST /tables (create table — owner only)', () => {
    const roles: UserRole[] = ['owner']

    it('allows owner', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      const req = mockReq('h1', { token: makeToken('u1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('blocks editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })

    it('blocks viewer', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('PUT /tables/:tableId (update schema — owner only)', () => {
    const roles: UserRole[] = ['owner']

    it('blocks editor from schema update', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /tables/:tableId (delete table — owner only)', () => {
    const roles: UserRole[] = ['owner']

    it('blocks editor from table deletion', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'DELETE' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /tables/:tableId/rows (add row — editor+)', () => {
    const roles: UserRole[] = ['editor', 'owner']

    it('allows editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('blocks viewer from adding rows', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'POST' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('PUT /tables/:tableId/rows/:rowId (update row — viewer+ with RLS ownership check)', () => {
    const roles: UserRole[] = ['viewer', 'editor', 'owner']

    it('allows editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('allows viewer (RLS ownership check happens in route handler)', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('viewer')
    })

    it('blocks anonymous from updating rows', async () => {
      insertApp(testDb, 'h1', 'App')
      const req = mockReq('h1', { method: 'PUT' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /tables/:tableId/rows/:rowId (delete row — viewer+ with RLS ownership check)', () => {
    const roles: UserRole[] = ['viewer', 'editor', 'owner']

    it('allows editor', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'u2', 'editor')
      const req = mockReq('h1', { token: makeToken('u2'), method: 'DELETE' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
    })

    it('allows viewer (RLS ownership check happens in route handler)', async () => {
      const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
      addMember(testDb, app.id, 'u1', 'owner')
      addMember(testDb, app.id, 'v1', 'viewer')
      const req = mockReq('h1', { token: makeToken('v1'), method: 'DELETE' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(true)
      expect((req as AuthenticatedRequest).userRole).toBe('viewer')
    })

    it('blocks anonymous from deleting rows', async () => {
      insertApp(testDb, 'h1', 'App')
      const req = mockReq('h1', { method: 'DELETE' })
      const res = mockRes()
      expect(await runAuth(req, res, ...roles)).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })
})

describe('Editor config restriction in chat', () => {
  it('editor role is correctly resolved for config restriction check', async () => {
    const testDb = createTestDb()
    mockDbHolder.db = testDb

    const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
    addMember(testDb, app.id, 'u1', 'owner')
    addMember(testDb, app.id, 'u2', 'editor')

    // Editor passes auth for chat
    const req = mockReq('h1', { token: makeToken('u2'), method: 'POST' })
    const res = mockRes()
    expect(await runAuth(req, res, 'editor', 'owner')).toBe(true)
    expect((req as AuthenticatedRequest).userRole).toBe('editor')

    // The route handler checks userRole !== 'owner' to skip uiUpdate/pagesUpdate
    // This verifies the role is correctly attached for the handler to use
    const isOwner = (req as AuthenticatedRequest).userRole === 'owner'
    expect(isOwner).toBe(false)
  })

  it('owner role allows config changes in chat', async () => {
    const testDb = createTestDb()
    mockDbHolder.db = testDb

    const app = insertApp(testDb, 'h1', 'App', { userId: 'u1' })
    addMember(testDb, app.id, 'u1', 'owner')

    const req = mockReq('h1', { token: makeToken('u1'), method: 'POST' })
    const res = mockRes()
    expect(await runAuth(req, res, 'editor', 'owner')).toBe(true)

    const isOwner = (req as AuthenticatedRequest).userRole === 'owner'
    expect(isOwner).toBe(true)
  })
})
