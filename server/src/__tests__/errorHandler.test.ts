import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { errorHandler } from '../middleware/errorHandler.js'

function createMockReq(): Partial<Request> {
  return { method: 'GET', url: '/test' }
}

function createMockRes(): Partial<Response> & { statusCode: number; body: unknown } {
  const res: Partial<Response> & { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code: number) {
      res.statusCode = code
      return res as Response
    },
    json(data: unknown) {
      res.body = data
      return res as Response
    },
  }
  return res
}

describe('errorHandler middleware', () => {
  const next: NextFunction = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 500 with generic error message', () => {
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('Something broke')

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })

  it('does not leak stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('Secret DB error')
    err.stack = 'Error: Secret DB error\n    at somefile.ts:10:5'

    errorHandler(err, req as Request, res as unknown as Response, next)

    // Should log message only, not the full stack
    expect(consoleSpy).toHaveBeenCalledWith('[errorHandler]', 'Secret DB error')
    // Response should not contain stack
    expect(res.body).toEqual({ error: 'Internal server error' })
    expect(JSON.stringify(res.body)).not.toContain('somefile')

    process.env.NODE_ENV = originalEnv
  })

  it('logs stack trace in development', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('Dev error')
    err.stack = 'Error: Dev error\n    at devfile.ts:20:3'

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(consoleSpy).toHaveBeenCalledWith('[errorHandler]', err.stack)

    process.env.NODE_ENV = originalEnv
  })

  it('does not send response if headers already sent', () => {
    const req = createMockReq()
    const res = createMockRes()
    res.headersSent = true
    const statusSpy = vi.fn()
    res.status = statusSpy as unknown as typeof res.status
    const err = new Error('Late error')

    vi.spyOn(console, 'error').mockImplementation(() => {})
    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('handles error without stack property', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('No stack')
    delete err.stack

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(consoleSpy).toHaveBeenCalledWith('[errorHandler]', 'No stack')
    expect(res.statusCode).toBe(500)

    process.env.NODE_ENV = originalEnv
  })
})
