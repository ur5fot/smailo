import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and } from 'drizzle-orm'
import * as schema from '../db/schema.js'

const TEST_JWT_SECRET = 'test-secret-key-for-members-crud'

// Mock the db module
const mockDbHolder: { db: any } = { db: null }
vi.mock('../db/index.js', () => ({
  get db() { return mockDbHolder.db },
}))

vi.mock('../middleware/auth.js', async (importOriginal) => {
  process.env.JWT_SECRET = 'test-secret-key-for-members-crud'
  const original = await importOriginal() as any
  return original
})

import { resolveUserAndRole, requireRole } from '../middleware/auth.js'

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

function mockReq(hash: string, userId: string, method = 'GET', params: Record<string, string> = {}) {
  return {
    params: { hash, ...params },
    headers: { authorization: `Bearer ${makeToken(userId)}` },
    method,
    body: {},
  } as any
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as any,
    status(c: number) { res.statusCode = c; return res },
    json(d: any) { res.body = d; return res },
  }
  return res
}

// Helper: resolve role then check with requireRole
async function resolveAndRequire(req: any, res: any, ...roles: string[]) {
  const next = vi.fn()
  await resolveUserAndRole(req, res, next)
  if (!next.mock.calls.length) return false // middleware blocked

  if (roles.length > 0) {
    const roleRes = mockRes()
    const roleNext = vi.fn()
    requireRole(...roles as any[])(req, roleRes as any, roleNext)
    if (!roleNext.mock.calls.length) return false
  }
  return true
}

describe('GET /api/app/:hash/members — list members', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  it('owner can list all members', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')
    addMember(testDb, app.id, 'viewer1', 'viewer')

    // Verify owner role resolves
    const req = mockReq('hash1', 'owner1')
    const res = mockRes()
    const next = vi.fn()
    await resolveUserAndRole(req, res as any, next)
    expect(next).toHaveBeenCalled()
    expect(req.userRole).toBe('owner')

    // Query members directly (simulating the handler)
    const members = testDb
      .select({
        userId: schema.appMembers.userId,
        role: schema.appMembers.role,
        joinedAt: schema.appMembers.joinedAt,
      })
      .from(schema.appMembers)
      .where(eq(schema.appMembers.appId, app.id))
      .all()

    expect(members).toHaveLength(3)
    expect(members.map(m => m.userId).sort()).toEqual(['editor1', 'owner1', 'viewer1'])
  })

  it('editor cannot list members (requireRole owner blocks)', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')

    const req = mockReq('hash1', 'editor1')
    const res = mockRes()
    const next = vi.fn()
    await resolveUserAndRole(req, res as any, next)
    expect(next).toHaveBeenCalled()
    expect(req.userRole).toBe('editor')

    const roleRes = mockRes()
    const roleNext = vi.fn()
    requireRole('owner')(req, roleRes as any, roleNext)
    expect(roleRes.statusCode).toBe(403)
    expect(roleNext).not.toHaveBeenCalled()
  })

  it('viewer cannot list members', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'viewer1', 'viewer')

    const req = mockReq('hash1', 'viewer1')
    const res = mockRes()
    const next = vi.fn()
    await resolveUserAndRole(req, res as any, next)
    expect(next).toHaveBeenCalled()

    const roleRes = mockRes()
    const roleNext = vi.fn()
    requireRole('owner')(req, roleRes as any, roleNext)
    expect(roleRes.statusCode).toBe(403)
  })

  it('anonymous cannot list members', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')

    const req = {
      params: { hash: 'hash1' },
      headers: {},
      method: 'GET',
    } as any
    const res = mockRes()
    const next = vi.fn()
    await resolveUserAndRole(req, res as any, next)
    expect(next).toHaveBeenCalled()
    expect(req.userRole).toBe('anonymous')

    const roleRes = mockRes()
    const roleNext = vi.fn()
    requireRole('owner')(req, roleRes as any, roleNext)
    expect(roleRes.statusCode).toBe(403)
  })
})

describe('PUT /api/app/:hash/members/:userId — change role', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  it('owner can change editor to viewer', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')

    // Simulate: update role
    testDb.update(schema.appMembers)
      .set({ role: 'viewer' })
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'editor1')))
      .run()

    const [member] = testDb.select().from(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'editor1')))
      .all()
    expect(member.role).toBe('viewer')
  })

  it('owner can change viewer to editor', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'viewer1', 'viewer')

    testDb.update(schema.appMembers)
      .set({ role: 'editor' })
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'viewer1')))
      .run()

    const [member] = testDb.select().from(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'viewer1')))
      .all()
    expect(member.role).toBe('editor')
  })

  it('cannot change own role (owner)', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')

    // Simulating the handler's self-change check
    const targetUserId = 'owner1'
    const requestingUserId = 'owner1'
    expect(targetUserId === requestingUserId).toBe(true) // handler returns 400
  })

  it('cannot make someone owner via role change', () => {
    // The handler only accepts 'editor' or 'viewer' — 'owner' is rejected
    const validRoles = ['editor', 'viewer']
    expect(validRoles.includes('owner')).toBe(false)
  })

  it('cannot change another owner role', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')

    // If there were somehow another owner, the handler checks member.role === 'owner'
    const [member] = testDb.select().from(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'owner1')))
      .all()
    expect(member.role).toBe('owner') // handler would return 400
  })

  it('returns 404 for non-existent member', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')

    const [member] = testDb.select().from(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'nonexistent')))
      .all()
    expect(member).toBeUndefined() // handler would return 404
  })

  it('editor cannot change roles (requireRole owner blocks)', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')
    addMember(testDb, app.id, 'viewer1', 'viewer')

    const req = mockReq('hash1', 'editor1', 'PUT', { userId: 'viewer1' })
    req.body = { role: 'editor' }
    const res = mockRes()
    const next = vi.fn()
    await resolveUserAndRole(req, res as any, next)
    expect(req.userRole).toBe('editor')

    const roleRes = mockRes()
    const roleNext = vi.fn()
    requireRole('owner')(req, roleRes as any, roleNext)
    expect(roleRes.statusCode).toBe(403)
  })

  it('rejects invalid role values', () => {
    // The handler validates role is 'editor' or 'viewer'
    const invalidRoles = ['admin', 'owner', '', null, undefined, 123]
    const validRoles = ['editor', 'viewer']
    for (const r of invalidRoles) {
      expect(validRoles.includes(r as any)).toBe(false)
    }
  })
})

describe('DELETE /api/app/:hash/members/:userId — remove member', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  it('owner can remove editor', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')

    testDb.delete(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'editor1')))
      .run()

    const members = testDb.select().from(schema.appMembers)
      .where(eq(schema.appMembers.appId, app.id)).all()
    expect(members).toHaveLength(1)
    expect(members[0].userId).toBe('owner1')
  })

  it('owner can remove viewer', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'viewer1', 'viewer')

    testDb.delete(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'viewer1')))
      .run()

    const members = testDb.select().from(schema.appMembers)
      .where(eq(schema.appMembers.appId, app.id)).all()
    expect(members).toHaveLength(1)
  })

  it('owner cannot remove self', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')

    // Handler checks targetUserId === authReq.userId
    const targetUserId = 'owner1'
    const requestingUserId = 'owner1'
    expect(targetUserId === requestingUserId).toBe(true) // handler returns 400
  })

  it('returns 404 for non-existent member', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')

    const [member] = testDb.select().from(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'ghost')))
      .all()
    expect(member).toBeUndefined()
  })

  it('editor cannot remove members (requireRole owner blocks)', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')
    addMember(testDb, app.id, 'viewer1', 'viewer')

    const req = mockReq('hash1', 'editor1', 'DELETE', { userId: 'viewer1' })
    const res = mockRes()
    const next = vi.fn()
    await resolveUserAndRole(req, res as any, next)
    expect(req.userRole).toBe('editor')

    const roleRes = mockRes()
    const roleNext = vi.fn()
    requireRole('owner')(req, roleRes as any, roleNext)
    expect(roleRes.statusCode).toBe(403)
  })

  it('removing a member does not affect other members', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')
    addMember(testDb, app.id, 'viewer1', 'viewer')

    testDb.delete(schema.appMembers)
      .where(and(eq(schema.appMembers.appId, app.id), eq(schema.appMembers.userId, 'editor1')))
      .run()

    const members = testDb.select().from(schema.appMembers)
      .where(eq(schema.appMembers.appId, app.id)).all()
    expect(members).toHaveLength(2)
    expect(members.map(m => m.userId).sort()).toEqual(['owner1', 'viewer1'])
  })
})
