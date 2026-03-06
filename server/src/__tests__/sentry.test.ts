import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockInit, mockCaptureException, mockFlush, mockWithScope, mockSetupExpressErrorHandler } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockCaptureException: vi.fn(),
  mockFlush: vi.fn().mockResolvedValue(true),
  mockWithScope: vi.fn((cb: (scope: unknown) => void) => {
    const scope = { setTag: vi.fn() }
    cb(scope)
    return scope
  }),
  mockSetupExpressErrorHandler: vi.fn(),
}))

vi.mock('@sentry/node', () => ({
  init: mockInit,
  captureException: mockCaptureException,
  flush: mockFlush,
  withScope: mockWithScope,
  setupExpressErrorHandler: mockSetupExpressErrorHandler,
}))

import {
  initSentry,
  isSentryInitialized,
  captureException,
  flushSentry,
  sentryContextMiddleware,
} from '../utils/sentry.js'

describe('sentry utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initSentry', () => {
    it('does not call Sentry.init when DSN is undefined', () => {
      initSentry(undefined)
      expect(mockInit).not.toHaveBeenCalled()
    })

    it('calls Sentry.init when DSN is provided', () => {
      initSentry('https://abc@sentry.io/123')
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://abc@sentry.io/123',
        })
      )
    })
  })

  describe('captureException', () => {
    it('captures exception via Sentry.withScope after init', () => {
      // initSentry was called with DSN above, so initialized = true
      const err = new Error('test error')
      captureException(err)
      expect(mockWithScope).toHaveBeenCalled()
      expect(mockCaptureException).toHaveBeenCalledWith(err)
    })

    it('captures exception with context tags', () => {
      const err = new Error('cron failed')
      captureException(err, { jobId: '42', appId: '7' })

      expect(mockWithScope).toHaveBeenCalled()
      const scopeCallback = mockWithScope.mock.calls[mockWithScope.mock.calls.length - 1][0]
      const scope = { setTag: vi.fn() }
      scopeCallback(scope)
      expect(scope.setTag).toHaveBeenCalledWith('jobId', '42')
      expect(scope.setTag).toHaveBeenCalledWith('appId', '7')
      expect(mockCaptureException).toHaveBeenCalledWith(err)
    })
  })

  describe('flushSentry', () => {
    it('calls Sentry.flush with timeout', async () => {
      await flushSentry(3000)
      expect(mockFlush).toHaveBeenCalledWith(3000)
    })
  })

  describe('isSentryInitialized', () => {
    it('returns true after init with DSN', () => {
      expect(isSentryInitialized()).toBe(true)
    })
  })

  describe('sentryContextMiddleware', () => {
    it('calls next and enriches scope with request context', () => {
      const next = vi.fn()
      const req = { params: { hash: 'abc123' }, userId: 'user1', id: 'req-id' }
      sentryContextMiddleware(req, {}, next)
      expect(next).toHaveBeenCalled()
      expect(mockWithScope).toHaveBeenCalled()
    })

    it('calls next when no params present', () => {
      const next = vi.fn()
      sentryContextMiddleware({}, {}, next)
      expect(next).toHaveBeenCalled()
    })
  })
})
