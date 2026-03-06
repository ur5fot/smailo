import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

const mockStopAll = vi.fn()
vi.mock('../services/cronManager.js', () => ({
  cronManager: { stopAll: mockStopAll },
}))

describe('setupGracefulShutdown', () => {
  let processListeners: Map<string, Function>
  let originalOn: typeof process.on
  let originalExit: typeof process.exit

  beforeEach(() => {
    vi.clearAllMocks()
    processListeners = new Map()

    originalOn = process.on
    originalExit = process.exit

    // Intercept process.on to capture signal handlers
    process.on = vi.fn((event: string, handler: Function) => {
      processListeners.set(event, handler)
      return process
    }) as any

    // Mock process.exit to prevent test from actually exiting
    process.exit = vi.fn() as any
  })

  afterEach(() => {
    process.on = originalOn
    process.exit = originalExit
    vi.restoreAllMocks()
  })

  it('registers SIGTERM and SIGINT handlers', async () => {
    const { setupGracefulShutdown } = await import('../utils/shutdown.js')
    const mockServer = { close: vi.fn((cb: Function) => cb()) } as any
    const mockSqlite = { close: vi.fn() } as any

    setupGracefulShutdown(mockServer, mockSqlite)

    expect(processListeners.has('SIGTERM')).toBe(true)
    expect(processListeners.has('SIGINT')).toBe(true)
  })

  it('closes server, stops cron, closes DB on SIGTERM', async () => {
    // Need fresh import to reset isShuttingDown
    vi.resetModules()

    const mockStopAllFresh = vi.fn()
    vi.doMock('../services/cronManager.js', () => ({
      cronManager: { stopAll: mockStopAllFresh },
    }))

    const { setupGracefulShutdown } = await import('../utils/shutdown.js')
    const closeCb = vi.fn()
    const mockServer = {
      close: vi.fn((cb: Function) => {
        closeCb()
        cb()
      }),
    } as any
    const mockSqlite = { close: vi.fn() } as any

    setupGracefulShutdown(mockServer, mockSqlite)

    // Trigger SIGTERM handler
    const sigterm = processListeners.get('SIGTERM')!
    sigterm()

    expect(mockServer.close).toHaveBeenCalledOnce()
    expect(mockStopAllFresh).toHaveBeenCalledOnce()
    expect(mockSqlite.close).toHaveBeenCalledOnce()
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('only runs shutdown once even if signal received twice', async () => {
    vi.resetModules()

    const mockStopAllFresh = vi.fn()
    vi.doMock('../services/cronManager.js', () => ({
      cronManager: { stopAll: mockStopAllFresh },
    }))

    const { setupGracefulShutdown } = await import('../utils/shutdown.js')
    const mockServer = {
      close: vi.fn((cb: Function) => cb()),
    } as any
    const mockSqlite = { close: vi.fn() } as any

    setupGracefulShutdown(mockServer, mockSqlite)

    const sigterm = processListeners.get('SIGTERM')!
    sigterm()
    sigterm() // second call

    expect(mockServer.close).toHaveBeenCalledOnce()
  })

  it('handles errors in cron stopAll without crashing', async () => {
    vi.resetModules()

    const mockStopAllFresh = vi.fn(() => { throw new Error('cron error') })
    vi.doMock('../services/cronManager.js', () => ({
      cronManager: { stopAll: mockStopAllFresh },
    }))

    const { setupGracefulShutdown } = await import('../utils/shutdown.js')
    const mockServer = {
      close: vi.fn((cb: Function) => cb()),
    } as any
    const mockSqlite = { close: vi.fn() } as any

    setupGracefulShutdown(mockServer, mockSqlite)

    const sigterm = processListeners.get('SIGTERM')!
    // Should not throw
    sigterm()

    // DB close should still be called even if cron stop fails
    expect(mockSqlite.close).toHaveBeenCalledOnce()
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('handles errors in sqlite close without crashing', async () => {
    vi.resetModules()

    const mockStopAllFresh = vi.fn()
    vi.doMock('../services/cronManager.js', () => ({
      cronManager: { stopAll: mockStopAllFresh },
    }))

    const { setupGracefulShutdown } = await import('../utils/shutdown.js')
    const mockServer = {
      close: vi.fn((cb: Function) => cb()),
    } as any
    const mockSqlite = { close: vi.fn(() => { throw new Error('db error') }) } as any

    setupGracefulShutdown(mockServer, mockSqlite)

    const sigterm = processListeners.get('SIGTERM')!
    sigterm()

    expect(process.exit).toHaveBeenCalledWith(0)
  })
})
