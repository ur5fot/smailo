import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'

function makeRequest(
  app: express.Express,
  path: string,
  headers?: Record<string, string>
): Promise<{ status: number; headers: Headers; body: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('bad addr')); return }
      fetch(`http://127.0.0.1:${addr.port}${path}`, { headers })
        .then(async (res) => {
          const body = await res.text()
          server.close()
          resolve({ status: res.status, headers: res.headers, body })
        })
        .catch((err) => { server.close(); reject(err) })
    })
  })
}

describe('logger', () => {
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    vi.resetModules()
  })

  it('creates logger with debug level in development', async () => {
    process.env.NODE_ENV = 'development'
    // Dynamic import to pick up current NODE_ENV
    const { logger } = await import('../utils/logger.js')
    expect(logger.level).toBe('debug')
  })

  it('creates logger with info level in production', async () => {
    process.env.NODE_ENV = 'production'
    const { logger } = await import('../utils/logger.js')
    expect(logger.level).toBe('info')
  })
})

describe('pino-http middleware / X-Request-Id', () => {
  it('generates X-Request-Id when not provided', async () => {
    const { httpLogger } = await import('../utils/logger.js')
    const app = express()
    app.use(httpLogger)
    app.use((req, res, next) => {
      const reqId = req.id
      if (reqId) res.setHeader('X-Request-Id', String(reqId))
      next()
    })
    app.get('/test', (_req, res) => res.json({ ok: true }))

    const { headers } = await makeRequest(app, '/test')
    const reqId = headers.get('x-request-id')
    expect(reqId).toBeTruthy()
    // Should be a valid UUID
    expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('preserves incoming X-Request-Id header', async () => {
    const { httpLogger } = await import('../utils/logger.js')
    const app = express()
    app.use(httpLogger)
    app.use((req, res, next) => {
      const reqId = req.id
      if (reqId) res.setHeader('X-Request-Id', String(reqId))
      next()
    })
    app.get('/test', (_req, res) => res.json({ ok: true }))

    const customId = 'my-custom-request-id-123'
    const { headers } = await makeRequest(app, '/test', { 'x-request-id': customId })
    expect(headers.get('x-request-id')).toBe(customId)
  })

  it('generates different IDs for different requests', async () => {
    const { httpLogger } = await import('../utils/logger.js')
    const app = express()
    app.use(httpLogger)
    app.use((req, res, next) => {
      const reqId = req.id
      if (reqId) res.setHeader('X-Request-Id', String(reqId))
      next()
    })
    app.get('/test', (_req, res) => res.json({ ok: true }))

    const { headers: h1 } = await makeRequest(app, '/test')
    const { headers: h2 } = await makeRequest(app, '/test')
    expect(h1.get('x-request-id')).not.toBe(h2.get('x-request-id'))
  })
})
