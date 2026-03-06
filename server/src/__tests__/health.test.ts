import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import { healthRouter } from '../routes/health.js'

function createApp() {
  const app = express()
  app.use('/api/health', healthRouter)
  return app
}

function request(app: express.Express, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('bad addr')); return }
      fetch(`http://127.0.0.1:${addr.port}${path}`)
        .then(async (res) => {
          const body = await res.json()
          server.close()
          resolve({ status: res.status, body: body as Record<string, unknown> })
        })
        .catch((err) => { server.close(); reject(err) })
    })
  })
}

describe('GET /api/health', () => {
  it('returns ok true with uptime when DB is available', async () => {
    const app = createApp()
    const { status, body } = await request(app, '/api/health')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
  })

  it('returns 503 when DB query fails', async () => {
    // Mock db.get to throw
    const dbModule = await import('../db/index.js')
    const originalGet = dbModule.db.get
    dbModule.db.get = (() => { throw new Error('DB gone') }) as typeof dbModule.db.get

    try {
      const app = createApp()
      const { status, body } = await request(app, '/api/health')
      expect(status).toBe(503)
      expect(body).toEqual({ ok: false, error: 'db' })
    } finally {
      dbModule.db.get = originalGet
    }
  })

  it('does not require authentication', async () => {
    const app = createApp()
    // No auth headers - should still succeed
    const { status } = await request(app, '/api/health')
    expect(status).toBe(200)
  })
})
