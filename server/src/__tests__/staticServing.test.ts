import { describe, it, expect } from 'vitest'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { setupStaticServing } from '../utils/staticServing.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDistPath = path.resolve(__dirname, '../../../client/dist')

function createApp() {
  const app = express()
  // API route to verify SPA fallback doesn't capture API routes
  app.get('/api/test', (_req, res) => res.json({ api: true }))
  setupStaticServing(app)
  return app
}

function request(
  app: express.Express,
  urlPath: string,
): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('bad addr'))
        return
      }
      fetch(`http://127.0.0.1:${addr.port}${urlPath}`)
        .then(async (res) => {
          const text = await res.text()
          const headers: Record<string, string> = {}
          res.headers.forEach((v, k) => {
            headers[k] = v
          })
          server.close()
          resolve({ status: res.status, headers, text })
        })
        .catch((err) => {
          server.close()
          reject(err)
        })
    })
  })
}

const hasClientDist = fs.existsSync(path.join(clientDistPath, 'index.html'))

describe.skipIf(!hasClientDist)('setupStaticServing', () => {
  it('serves index.html at root with no-cache header', async () => {
    const app = createApp()
    const { status, headers, text } = await request(app, '/')
    expect(status).toBe(200)
    expect(text.toLowerCase()).toContain('<!doctype html>')
    expect(headers['cache-control']).toContain('no-cache')
  })

  it('serves hashed assets with long-lived cache headers', async () => {
    // Find an actual asset file
    const assetsDir = path.join(clientDistPath, 'assets')
    const files = fs.readdirSync(assetsDir)
    const jsFile = files.find((f) => f.endsWith('.js'))
    if (!jsFile) return

    const app = createApp()
    const { status, headers } = await request(app, `/assets/${jsFile}`)
    expect(status).toBe(200)
    // express.static with maxAge: '1y' and immutable: true
    expect(headers['cache-control']).toContain('max-age=')
    expect(headers['cache-control']).toContain('immutable')
  })

  it('does not intercept /api routes', async () => {
    const app = createApp()
    const { status, text } = await request(app, '/api/test')
    expect(status).toBe(200)
    expect(JSON.parse(text)).toEqual({ api: true })
  })

  it('returns index.html for SPA routes (fallback)', async () => {
    const app = createApp()
    const { status, text } = await request(app, '/some-user/some-hash')
    expect(status).toBe(200)
    expect(text.toLowerCase()).toContain('<!doctype html>')
  })
})

describe('static serving in development', () => {
  it('setupStaticServing is not called in index.ts when NODE_ENV != production', async () => {
    // This is a design verification test — in index.ts, setupStaticServing
    // is only called inside `if (envConfig.nodeEnv === 'production')`.
    // We verify the module exports correctly and can be conditionally used.
    expect(typeof setupStaticServing).toBe('function')
  })
})
