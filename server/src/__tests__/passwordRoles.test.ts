import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and } from 'drizzle-orm'
import type { Request, Response } from 'express'
import * as schema from '../db/schema.js'

const TEST_JWT_SECRET = 'test-secret-key-for-password-roles'

// Mock the db module
const mockDbHolder: { db: any } = { db: null }
vi.mock('../db/index.js', () => ({
  get db() { return mockDbHolder.db },
}))

// Force JWT_SECRET before auth module initializes
vi.mock('../middleware/auth.js', async (importOriginal) => {
  process.env.JWT_SECRET = 'test-secret-key-for-password-roles'
  const original = await importOriginal() as any
  return original
})

import { resolveUserAndRole, requireRole, JWT_SECRET } from '../middleware/auth.js'
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
  `)

  return testDb
}

function setDb(testDb: ReturnType<typeof createTestDb>) {
  mockDbHolder.db = testDb
}

function insertApp(testDb: ReturnType<typeof createTestDb>, hash: string, appName: string, opts?: { userId?: string; passwordHash?: string; passwordVersion?: number }) {
  return testDb.insert(schema.apps).values({
    hash,
    appName,
    userId: opts?.userId ?? null,
    passwordHash: opts?.passwordHash ?? null,
    passwordVersion: opts?.passwordVersion ?? 0,
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

function makeGlobalToken(userId: string): string {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '30d' })
}

function makePerAppToken(hash: string, userId: string | null, pv: number): string {
  return jwt.sign({ hash, userId, pv }, TEST_JWT_SECRET, { expiresIn: '7d' })
}

function mockReq(hash: string, opts?: { globalToken?: string; appToken?: string; method?: string }): Request {
  const headers: Record<string, string> = {}
  if (opts?.globalToken) {
    headers['authorization'] = `Bearer ${opts.globalToken}`
  }
  if (opts?.appToken) {
    headers['x-app-token'] = opts.appToken
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

describe('Password-protected apps with roles', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  describe('per-app JWT via X-App-Token', () => {
    it('grants viewer access with valid per-app JWT (no app_members entry)', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 1 })
      const appToken = makePerAppToken('hash1', 'user2', 1)

      const req = mockReq('hash1', { appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('viewer')
    })

    it('grants role from app_members when per-app JWT has userId', async () => {
      const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 1 })
      addMember(testDb, app.id, 'owner1', 'owner')
      addMember(testDb, app.id, 'editor1', 'editor')
      const appToken = makePerAppToken('hash1', 'editor1', 1)

      const req = mockReq('hash1', { appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('editor')
      expect((req as AuthenticatedRequest).userId).toBe('editor1')
    })

    it('rejects per-app JWT with wrong passwordVersion (revoked)', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 2 })
      const appToken = makePerAppToken('hash1', 'user1', 1) // old version

      const req = mockReq('hash1', { appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(res.body.error).toContain('revoked')
      expect(next).not.toHaveBeenCalled()
    })

    it('rejects per-app JWT with wrong hash', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 1 })
      const appToken = makePerAppToken('wrong-hash', 'user1', 1)

      const req = mockReq('hash1', { appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Authentication required')
      expect(next).not.toHaveBeenCalled()
    })

    it('rejects invalid per-app JWT', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 1 })

      const req = mockReq('hash1', { appToken: 'garbage-token' })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(next).not.toHaveBeenCalled()
    })

    it('handles legacy per-app JWT without userId (viewer fallback)', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 0 })
      // Legacy per-app JWT: { hash } only, no userId, no pv
      const appToken = jwt.sign({ hash: 'hash1' }, TEST_JWT_SECRET, { expiresIn: '7d' })

      const req = mockReq('hash1', { appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('viewer')
    })
  })

  describe('global JWT takes priority over per-app JWT', () => {
    it('uses global JWT when both global and per-app JWT are present', async () => {
      const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 1 })
      addMember(testDb, app.id, 'owner1', 'owner')
      const globalToken = makeGlobalToken('owner1')
      const appToken = makePerAppToken('hash1', 'user2', 1)

      const req = mockReq('hash1', { globalToken, appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('owner')
      expect((req as AuthenticatedRequest).userId).toBe('owner1')
    })

    it('falls back to per-app JWT when global JWT user has no role', async () => {
      const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 1 })
      addMember(testDb, app.id, 'owner1', 'owner')
      addMember(testDb, app.id, 'viewer1', 'viewer')
      const globalToken = makeGlobalToken('stranger') // no role for this user
      const appToken = makePerAppToken('hash1', 'viewer1', 1)

      const req = mockReq('hash1', { globalToken, appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('viewer')
      expect((req as AuthenticatedRequest).userId).toBe('viewer1')
    })
  })

  describe('member bypasses password', () => {
    it('member with global JWT accesses password-protected app without per-app JWT', async () => {
      const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 1 })
      addMember(testDb, app.id, 'owner1', 'owner')
      addMember(testDb, app.id, 'editor1', 'editor')
      const globalToken = makeGlobalToken('editor1')

      const req = mockReq('hash1', { globalToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
      expect((req as AuthenticatedRequest).userRole).toBe('editor')
    })
  })

  describe('per-app JWT payload structure', () => {
    it('per-app JWT contains hash, userId, and pv fields', () => {
      const token = makePerAppToken('hash1', 'user1', 1)
      const payload = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload
      expect(payload.hash).toBe('hash1')
      expect(payload.userId).toBe('user1')
      expect(payload.pv).toBe(1)
    })

    it('per-app JWT with null userId is valid (anonymous password verification)', () => {
      const token = makePerAppToken('hash1', null, 1)
      const payload = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload
      expect(payload.hash).toBe('hash1')
      expect(payload.userId).toBeNull()
      expect(payload.pv).toBe(1)
    })
  })

  describe('passwordVersion revocation', () => {
    it('per-app JWT with version 0 works on app with version 0', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 0 })
      const appToken = makePerAppToken('hash1', 'user1', 0)

      const req = mockReq('hash1', { appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('per-app JWT with version 1 is rejected after password change bumps to version 2', async () => {
      insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1', passwordHash: '$2a$12$fake', passwordVersion: 2 })
      const appToken = makePerAppToken('hash1', 'user1', 1)

      const req = mockReq('hash1', { appToken })
      const res = mockRes()
      const next = vi.fn()

      await resolveUserAndRole(req, res, next)
      expect(res.statusCode).toBe(401)
      expect(res.body.error).toContain('revoked')
    })
  })
})
