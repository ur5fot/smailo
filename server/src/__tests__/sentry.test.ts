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

describe('sentry utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  async function loadSentry() {
    return await import('../utils/sentry.js')
  }

  describe('initSentry', () => {
    it('does not call Sentry.init when DSN is undefined', async () => {
      const { initSentry } = await loadSentry()
      initSentry(undefined)
      expect(mockInit).not.toHaveBeenCalled()
    })

    it('calls Sentry.init when DSN is provided', async () => {
      const { initSentry } = await loadSentry()
      initSentry('https://abc@sentry.io/123')
      expect(mockInit).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://abc@sentry.io/123',
        })
      )
    })
  })

  describe('captureException', () => {
    it('is a no-op when not initialized', async () => {
      const { captureException } = await loadSentry()
      captureException(new Error('test'))
      expect(mockWithScope).not.toHaveBeenCalled()
    })

    it('captures exception via Sentry.withScope after init', async () => {
      const { initSentry, captureException } = await loadSentry()
      initSentry('https://abc@sentry.io/123')

      const err = new Error('test error')
      captureException(err)
      expect(mockWithScope).toHaveBeenCalled()
      expect(mockCaptureException).toHaveBeenCalledWith(err)
    })

    it('captures exception with context tags', async () => {
      const { initSentry, captureException } = await loadSentry()
      initSentry('https://abc@sentry.io/123')

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
    it('is a no-op when not initialized', async () => {
      const { flushSentry } = await loadSentry()
      await flushSentry(3000)
      expect(mockFlush).not.toHaveBeenCalled()
    })

    it('calls Sentry.flush with timeout after init', async () => {
      const { initSentry, flushSentry } = await loadSentry()
      initSentry('https://abc@sentry.io/123')

      await flushSentry(3000)
      expect(mockFlush).toHaveBeenCalledWith(3000)
    })
  })

  describe('isSentryInitialized', () => {
    it('returns false before init', async () => {
      const { isSentryInitialized } = await loadSentry()
      expect(isSentryInitialized()).toBe(false)
    })

    it('returns true after init with DSN', async () => {
      const { initSentry, isSentryInitialized } = await loadSentry()
      initSentry('https://abc@sentry.io/123')
      expect(isSentryInitialized()).toBe(true)
    })
  })
})
