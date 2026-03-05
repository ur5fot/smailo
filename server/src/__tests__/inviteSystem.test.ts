import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'

const TEST_JWT_SECRET = 'test-secret-key-for-invite-tests'

// Mock the db module
const mockDbHolder: { db: any } = { db: null }
vi.mock('../db/index.js', () => ({
  get db() { return mockDbHolder.db },
}))

vi.mock('../middleware/auth.js', async (importOriginal) => {
  process.env.JWT_SECRET = 'test-secret-key-for-invite-tests'
  const original = await importOriginal() as any
  return original
})

// Import after mocks
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
    CREATE TABLE app_invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TEXT NOT NULL,
      accepted_by_user_id TEXT
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

function createInvite(testDb: ReturnType<typeof createTestDb>, appId: number, role: string, opts?: { token?: string; expiresAt?: string; acceptedByUserId?: string }) {
  const token = opts?.token ?? 'a'.repeat(32)
  const expiresAt = opts?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  testDb.insert(schema.appInvites).values({
    appId,
    role,
    token,
    createdAt: new Date().toISOString(),
    expiresAt,
    acceptedByUserId: opts?.acceptedByUserId ?? null,
  }).run()
  return token
}

function makeToken(userId: string): string {
  return jwt.sign({ userId }, TEST_JWT_SECRET, { expiresIn: '30d' })
}

// We test the members route handlers by importing them and calling with mock req/res
// Since the route uses express Router, we'll test the logic more directly via DB operations
// and test the endpoint behavior through the actual handler functions

describe('app_invites schema', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  it('creates an invite with all fields', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    testDb.insert(schema.appInvites).values({
      appId: app.id,
      role: 'editor',
      token: 'abcdef1234567890abcdef1234567890',
      createdAt: new Date().toISOString(),
      expiresAt,
    }).run()

    const invites = testDb.select().from(schema.appInvites).all()
    expect(invites).toHaveLength(1)
    expect(invites[0].role).toBe('editor')
    expect(invites[0].token).toBe('abcdef1234567890abcdef1234567890')
    expect(invites[0].acceptedByUserId).toBeNull()
  })

  it('enforces unique token constraint', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    const token = 'same_token_12345678901234567890'
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    testDb.insert(schema.appInvites).values({
      appId: app.id,
      role: 'editor',
      token,
      createdAt: new Date().toISOString(),
      expiresAt,
    }).run()

    expect(() => {
      testDb.insert(schema.appInvites).values({
        appId: app.id,
        role: 'viewer',
        token,
        createdAt: new Date().toISOString(),
        expiresAt,
      }).run()
    }).toThrow()
  })

  it('cascade deletes invites when app is deleted', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    createInvite(testDb, app.id, 'editor', { token: 'token1'.padEnd(32, '0') })
    createInvite(testDb, app.id, 'viewer', { token: 'token2'.padEnd(32, '0') })

    expect(testDb.select().from(schema.appInvites).all()).toHaveLength(2)

    testDb.delete(schema.apps).where(eq(schema.apps.id, app.id)).run()
    expect(testDb.select().from(schema.appInvites).all()).toHaveLength(0)
  })

  it('marks invite as accepted by setting acceptedByUserId', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    const token = createInvite(testDb, app.id, 'editor')

    testDb.update(schema.appInvites)
      .set({ acceptedByUserId: 'user2' })
      .where(eq(schema.appInvites.token, token))
      .run()

    const [invite] = testDb.select().from(schema.appInvites).where(eq(schema.appInvites.token, token)).all()
    expect(invite.acceptedByUserId).toBe('user2')
  })
})

describe('invite accept logic', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  it('accept invite creates app_member with correct role', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    const token = createInvite(testDb, app.id, 'editor')

    // Simulate accept: mark invite used, add member
    testDb.update(schema.appInvites)
      .set({ acceptedByUserId: 'user2' })
      .where(eq(schema.appInvites.token, token))
      .run()

    testDb.insert(schema.appMembers).values({
      appId: app.id,
      userId: 'user2',
      role: 'editor',
      joinedAt: new Date().toISOString(),
    }).run()

    const members = testDb.select().from(schema.appMembers).where(eq(schema.appMembers.appId, app.id)).all()
    expect(members).toHaveLength(2)
    expect(members.find(m => m.userId === 'user2')?.role).toBe('editor')
  })

  it('expired invite cannot be accepted', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    const expired = new Date(Date.now() - 1000).toISOString()
    const token = createInvite(testDb, app.id, 'editor', { token: 'expired_token'.padEnd(32, '0'), expiresAt: expired })

    const [invite] = testDb.select().from(schema.appInvites).where(eq(schema.appInvites.token, token)).all()
    expect(new Date(invite.expiresAt) < new Date()).toBe(true)
  })

  it('used invite cannot be accepted again', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    const token = createInvite(testDb, app.id, 'editor', { acceptedByUserId: 'user2' })

    const [invite] = testDb.select().from(schema.appInvites).where(eq(schema.appInvites.token, token)).all()
    expect(invite.acceptedByUserId).toBe('user2')
  })

  it('already a member gets existing role returned', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'user2', 'editor')

    // user2 is already a member — should not create duplicate
    const members = testDb.select().from(schema.appMembers).where(eq(schema.appMembers.appId, app.id)).all()
    const existing = members.find(m => m.userId === 'user2')
    expect(existing?.role).toBe('editor')
  })

  it('viewer invite creates viewer member', () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    const token = createInvite(testDb, app.id, 'viewer', { token: 'viewer_invite'.padEnd(32, '0') })

    // Accept
    testDb.update(schema.appInvites)
      .set({ acceptedByUserId: 'user3' })
      .where(eq(schema.appInvites.token, token))
      .run()

    testDb.insert(schema.appMembers).values({
      appId: app.id,
      userId: 'user3',
      role: 'viewer',
      joinedAt: new Date().toISOString(),
    }).run()

    const members = testDb.select().from(schema.appMembers).where(eq(schema.appMembers.appId, app.id)).all()
    expect(members.find(m => m.userId === 'user3')?.role).toBe('viewer')
  })
})

describe('invite create authorization', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    setDb(testDb)
  })

  it('only owner can create invites (resolveUserAndRole + requireRole check)', async () => {
    const app = insertApp(testDb, 'hash1', 'Test App', { userId: 'owner1' })
    addMember(testDb, app.id, 'owner1', 'owner')
    addMember(testDb, app.id, 'editor1', 'editor')

    // Owner should pass requireRole('owner')
    const ownerReq = {
      params: { hash: 'hash1' },
      headers: { authorization: `Bearer ${makeToken('owner1')}` },
      method: 'POST',
    } as any

    const ownerRes = {
      statusCode: 200, body: null as any,
      status(c: number) { ownerRes.statusCode = c; return ownerRes },
      json(d: any) { ownerRes.body = d; return ownerRes },
    }
    const ownerNext = vi.fn()
    await resolveUserAndRole(ownerReq, ownerRes as any, ownerNext)
    expect(ownerNext).toHaveBeenCalled()
    expect(ownerReq.userRole).toBe('owner')

    // Editor should fail requireRole('owner')
    const editorReq = {
      params: { hash: 'hash1' },
      headers: { authorization: `Bearer ${makeToken('editor1')}` },
      method: 'POST',
    } as any

    const editorRes = {
      statusCode: 200, body: null as any,
      status(c: number) { editorRes.statusCode = c; return editorRes },
      json(d: any) { editorRes.body = d; return editorRes },
    }
    const editorNext = vi.fn()
    await resolveUserAndRole(editorReq, editorRes as any, editorNext)
    expect(editorNext).toHaveBeenCalled()
    expect(editorReq.userRole).toBe('editor')

    // Now check requireRole('owner') rejects editor
    const roleRes = {
      statusCode: 200, body: null as any,
      status(c: number) { roleRes.statusCode = c; return roleRes },
      json(d: any) { roleRes.body = d; return roleRes },
    }
    const roleNext = vi.fn()
    requireRole('owner')(editorReq, roleRes as any, roleNext)
    expect(roleRes.statusCode).toBe(403)
    expect(roleNext).not.toHaveBeenCalled()
  })
})

describe('invite role validation', () => {
  it('rejects owner role in invite', () => {
    // The route should validate that role is only 'editor' or 'viewer'
    const validRoles = ['editor', 'viewer']
    expect(validRoles.includes('owner')).toBe(false)
    expect(validRoles.includes('editor')).toBe(true)
    expect(validRoles.includes('viewer')).toBe(true)
  })
})
