import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadEnvConfig, _resetEnvConfig } from '../utils/env.js'

describe('env validation', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    _resetEnvConfig()
  })

  afterEach(() => {
    process.env = originalEnv
    _resetEnvConfig()
  })

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET
    expect(() => loadEnvConfig()).toThrow('Missing required environment variable: JWT_SECRET')
  })

  it('throws when JWT_SECRET is too short in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'short'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    expect(() => loadEnvConfig()).toThrow('JWT_SECRET must be at least 32 characters in production')
  })

  it('allows short JWT_SECRET in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.JWT_SECRET = 'short'
    const config = loadEnvConfig()
    expect(config.jwtSecret).toBe('short')
  })

  it('throws when no AI key in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'a'.repeat(32)
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    expect(() => loadEnvConfig()).toThrow('At least one AI API key required in production')
  })

  it('allows missing AI keys in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.JWT_SECRET = 'test-secret'
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    const config = loadEnvConfig()
    expect(config.anthropicApiKey).toBeUndefined()
    expect(config.deepseekApiKey).toBeUndefined()
  })

  it('uses default PORT when not set', () => {
    process.env.JWT_SECRET = 'test-secret'
    delete process.env.PORT
    const config = loadEnvConfig()
    expect(config.port).toBe(3000)
  })

  it('parses PORT from env', () => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.PORT = '8080'
    const config = loadEnvConfig()
    expect(config.port).toBe(8080)
  })

  it('throws on invalid PORT', () => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.PORT = 'not-a-number'
    expect(() => loadEnvConfig()).toThrow('Invalid PORT value')
  })

  it('throws on PORT out of range', () => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.PORT = '99999'
    expect(() => loadEnvConfig()).toThrow('Invalid PORT value')
  })

  it('uses default clientUrl when CLIENT_URL not set', () => {
    process.env.JWT_SECRET = 'test-secret'
    delete process.env.CLIENT_URL
    const config = loadEnvConfig()
    expect(config.clientUrl).toBe('http://localhost:5173')
  })

  it('returns full config with all fields', () => {
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    process.env.DEEPSEEK_API_KEY = 'sk-deep-test'
    process.env.PORT = '4000'
    process.env.NODE_ENV = 'development'
    process.env.CLIENT_URL = 'https://example.com'
    process.env.AI_PROVIDER = 'deepseek'
    process.env.ANTHROPIC_MODEL = 'claude-opus-4-6'
    process.env.SENTRY_DSN = 'https://sentry.io/123'
    process.env.DATABASE_PATH = '/data/test.sqlite'
    process.env.BACKUP_DIR = '/data/backups'

    const config = loadEnvConfig()

    expect(config).toEqual({
      nodeEnv: 'development',
      isProduction: false,
      port: 4000,
      jwtSecret: 'a'.repeat(32),
      clientUrl: 'https://example.com',
      anthropicApiKey: 'sk-ant-test',
      deepseekApiKey: 'sk-deep-test',
      aiProvider: 'deepseek',
      anthropicModel: 'claude-opus-4-6',
      sentryDsn: 'https://sentry.io/123',
      databasePath: '/data/test.sqlite',
      backupDir: '/data/backups',
    })
  })

  it('accepts DEEPSEEK_API_KEY alone in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'a'.repeat(32)
    delete process.env.ANTHROPIC_API_KEY
    process.env.DEEPSEEK_API_KEY = 'sk-deep-test'
    const config = loadEnvConfig()
    expect(config.deepseekApiKey).toBe('sk-deep-test')
    expect(config.anthropicApiKey).toBeUndefined()
  })

  it('sets isProduction correctly', () => {
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.ANTHROPIC_API_KEY = 'test'
    process.env.NODE_ENV = 'production'
    const config = loadEnvConfig()
    expect(config.isProduction).toBe(true)

    _resetEnvConfig()
    process.env.NODE_ENV = 'development'
    const config2 = loadEnvConfig()
    expect(config2.isProduction).toBe(false)
  })
})
