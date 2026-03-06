import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { errorHandler } from '../middleware/errorHandler.js'

// Mock the logger module
vi.mock('../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { logger } from '../utils/logger.js'

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
    vi.clearAllMocks()
  })

  it('returns 500 with generic error message', () => {
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('Something broke')

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })

  it('logs the full error object including stack', () => {
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('DB error')

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(logger.error).toHaveBeenCalledWith(
      { err },
      'Unhandled route error'
    )
  })

  it('does not leak error details in response', () => {
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('Secret DB error')
    err.stack = 'Error: Secret DB error\n    at somefile.ts:10:5'

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(res.body).toEqual({ error: 'Internal server error' })
    expect(JSON.stringify(res.body)).not.toContain('somefile')
  })

  it('does not send response if headers already sent', () => {
    const req = createMockReq()
    const res = createMockRes()
    res.headersSent = true
    const statusSpy = vi.fn()
    res.status = statusSpy as unknown as typeof res.status
    const err = new Error('Late error')

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(statusSpy).not.toHaveBeenCalled()
  })

  it('handles error without stack property', () => {
    const req = createMockReq()
    const res = createMockRes()
    const err = new Error('No stack')
    delete err.stack

    errorHandler(err, req as Request, res as unknown as Response, next)

    expect(logger.error).toHaveBeenCalledWith(
      { err },
      'Unhandled route error'
    )
    expect(res.statusCode).toBe(500)
  })
})
