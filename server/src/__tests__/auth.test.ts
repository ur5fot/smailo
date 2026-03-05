import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { Request, Response } from 'express'
import * as schema from '../db/schema.js'

const TEST_JWT_SECRET = 'test-secret-key-for-auth-tests'

// Mock the db module — we'll replace db per test
const mockDbHolder: { db: any } = { db: null }
vi.mock('../db/index.js', () => ({
  get db() { return mockDbHolder.db },
}))

// Re-export auth module but with our test secret
vi.mock('../middleware/auth.js', async (importOriginal) => {
  // Force JWT_SECRET before the module initializes
  process.env.JWT_SECRET = 'test-secret-key-for-auth-tests'
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

  return testDb
}

function setDb(testDb: ReturnType<typeof createTestDb>) {
  mockDbHolder.db = testDb
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

describe('resolveUserAndRole', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  it('returns 404 for non-existent app', async () => {
    const req = mockReq('nonexistent')
    const res = mockRes()
    const next = vi.fn()

    await resolveUserAndRole(req, res, next)
    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('App not found')
    expect(next).not.toHaveBeenCalled()
  })

  describe('with app_members', () => {
    it('resolves owner role from app_members', async () => {
      const appRow = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
      addMember(testDb, appRow.id, 'owner1', 'owner')
      const token = makeToken('owner1')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      const authReq = req as AuthenticatedRequest
      expect(authReq.userRole).toBe('owner')
      expect(authReq.userId).toBe('owner1')
      expect(authReq.app_row?.id).toBe(appRow.id)
    })

    it('resolves editor role from app_members', async () => {
      const appRow = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
      addMember(testDb, appRow.id, 'owner1', 'owner')
      addMember(testDb, appRow.id, 'editor1', 'editor')
      const token = makeToken('editor1')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('editor')
    })

    it('resolves viewer role from app_members', async () => {
      const appRow = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
      addMember(testDb, appRow.id, 'owner1', 'owner')
      addMember(testDb, appRow.id, 'viewer1', 'viewer')
      const token = makeToken('viewer1')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('viewer')
    })

    it('returns anonymous for authenticated user with no membership in unprotected app', async () => {
      const appRow = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
      addMember(testDb, appRow.id, 'owner1', 'owner')
      const token = makeToken('stranger')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })

    it('returns 401 for authenticated user with no membership in password-protected app', async () => {
      const appRow = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake' })
      addMember(testDb, appRow.id, 'owner1', 'owner')
      const token = makeToken('stranger')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Authentication required')
      expect(next).not.toHaveBeenCalled()
    })

    it('member with role can access password-protected app via global JWT', async () => {
      const appRow = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake' })
      addMember(testDb, appRow.id, 'owner1', 'owner')
      addMember(testDb, appRow.id, 'editor1', 'editor')
      const token = makeToken('editor1')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('editor')
    })
  })

  describe('backward compatibility (no app_members)', () => {
    it('resolves owner via apps.userId when no app_members exist', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'creator1' })
      const token = makeToken('creator1')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('owner')
      expect((req as AuthenticatedRequest).userId).toBe('creator1')
    })

    it('returns anonymous for non-creator when no app_members exist (unprotected)', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'creator1' })
      const token = makeToken('other_user')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })

    it('resolves anonymous for legacy app without userId (no members, no userId)', async () => {
      insertApp(testDb, 'hash1', 'Test App')
      const token = makeToken('anyone')

      const req = mockReq('hash1', { token })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })
  })

  describe('anonymous access', () => {
    it('allows anonymous GET on unprotected app', async () => {
      insertApp(testDb, 'hash1', 'Test App')

      const req = mockReq('hash1')
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
      expect((req as AuthenticatedRequest).userId).toBeUndefined()
    })

    it('returns 401 for anonymous on password-protected app', async () => {
      insertApp(testDb, 'hash1', 'Test App', { passwordHash: '$2a$12$fake' })

      const req = mockReq('hash1')
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('JWT handling', () => {
    it('ignores invalid JWT and treats user as anonymous (unprotected)', async () => {
      insertApp(testDb, 'hash1', 'Test App')

      const req = mockReq('hash1', { token: 'invalid-token' })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
      expect((req as AuthenticatedRequest).userId).toBeUndefined()
    })

    it('ignores expired JWT and treats user as anonymous', async () => {
      insertApp(testDb, 'hash1', 'Test App')
      const expiredToken = jwt.sign({ userId: 'user1' }, TEST_JWT_SECRET, { expiresIn: '-1s' })

      const req = mockReq('hash1', { token: expiredToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })

    it('ignores JWT without userId field', async () => {
      insertApp(testDb, 'hash1', 'Test App')
      const badToken = jwt.sign({ hash: 'hash1' }, TEST_JWT_SECRET, { expiresIn: '30d' })

      const req = mockReq('hash1', { token: badToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })

    it('ignores X-User-Id header completely', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'creator1' })

      const req = mockReq('hash1')
      ;(req as any).headers['x-user-id'] = 'creator1'
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      // Without JWT, X-User-Id should be ignored
      expect((req as AuthenticatedRequest).userRole).toBe('anonymous')
    })
  })
})

describe('requireRole', () => {
  function mockAuthReq(userRole?: UserRole): Request {
    const req = { params: {}, headers: {} } as unknown as Request
    if (userRole) {
      (req as AuthenticatedRequest).userRole = userRole
    }
    return req
  }

  it('allows when role matches single allowed role', () => {
    const req = mockAuthReq('owner')
    const res = mockRes()
    const next = vi.fn()

    requireRole('owner')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('allows when role is in the allowed list', () => {
    const req = mockAuthReq('editor')
    const res = mockRes()
    const next = vi.fn()

    requireRole('editor', 'owner')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('denies when role is not in the allowed list', () => {
    const req = mockAuthReq('viewer')
    const res = mockRes()
    const next = vi.fn()

    requireRole('editor', 'owner')(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Insufficient permissions')
    expect(next).not.toHaveBeenCalled()
  })

  it('denies anonymous when not in allowed roles', () => {
    const req = mockAuthReq('anonymous')
    const res = mockRes()
    const next = vi.fn()

    requireRole('viewer', 'editor', 'owner')(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows anonymous when anonymous is in allowed roles', () => {
    const req = mockAuthReq('anonymous')
    const res = mockRes()
    const next = vi.fn()

    requireRole('anonymous', 'viewer', 'editor', 'owner')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('denies when userRole is missing (middleware not applied)', () => {
    const req = { params: {}, headers: {} } as unknown as Request
    const res = mockRes()
    const next = vi.fn()

    requireRole('owner')(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})
