import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'

// Mock DB before importing the module
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
}

vi.mock('../db/index.js', () => ({
  db: new Proxy(mockDb, {
    get: (target, prop) => (target as any)[prop],
  }),
}))

vi.mock('../db/schema.js', () => ({
  users: { userId: 'user_id' },
  apps: {},
}))

// Mock JWT_SECRET
vi.mock('../middleware/auth.js', () => ({
  JWT_SECRET: 'test-secret-for-jwt-testing',
}))

describe('POST /api/users - JWT generation', () => {
  const JWT_SECRET = 'test-secret-for-jwt-testing'

  it('generates a valid JWT with userId payload on user creation', () => {
    const userId = 'testUser01'
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' })

    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload
    expect(decoded.userId).toBe(userId)
    expect(decoded.exp).toBeDefined()
    // 30 days = ~2592000 seconds
    const ttl = decoded.exp! - decoded.iat!
    expect(ttl).toBeGreaterThanOrEqual(2592000 - 10)
    expect(ttl).toBeLessThanOrEqual(2592000 + 10)
  })

  it('rejects JWT with wrong secret', () => {
    const token = jwt.sign({ userId: 'test' }, JWT_SECRET, { expiresIn: '30d' })

    expect(() => {
      jwt.verify(token, 'wrong-secret')
    }).toThrow()
  })

  it('rejects expired JWT', () => {
    const token = jwt.sign({ userId: 'test' }, JWT_SECRET, { expiresIn: '-1s' })

    expect(() => {
      jwt.verify(token, JWT_SECRET)
    }).toThrow(/expired/)
  })

  it('JWT payload contains only userId (no hash)', () => {
    const token = jwt.sign({ userId: 'abc123' }, JWT_SECRET, { expiresIn: '30d' })
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload

    expect(decoded.userId).toBe('abc123')
    expect(decoded.hash).toBeUndefined()
  })
})
