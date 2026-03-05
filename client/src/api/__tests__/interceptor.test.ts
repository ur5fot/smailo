import { describe, it, expect, beforeEach } from 'vitest'

// Mock localStorage before importing api (which uses it at interceptor registration time)
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value },
  removeItem: (key: string) => { delete storage[key] },
  clear: () => { for (const k of Object.keys(storage)) delete storage[k] },
  get length() { return Object.keys(storage).length },
  key: (_i: number) => null as string | null,
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

import api from '../index'
import type { InternalAxiosRequestConfig } from 'axios'

function makeConfig(url: string): InternalAxiosRequestConfig {
  return {
    url,
    headers: new (api.defaults.headers.constructor as any)(),
  } as InternalAxiosRequestConfig
}

function runInterceptor(config: InternalAxiosRequestConfig) {
  const handler = (api.interceptors.request as any).handlers[0]
  return handler.fulfilled(config)
}

describe('Axios interceptor - JWT headers', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('sends global JWT in Authorization header', () => {
    localStorageMock.setItem('smailo_token', 'global-jwt-123')
    const config = runInterceptor(makeConfig('/users'))
    expect(config.headers.Authorization).toBe('Bearer global-jwt-123')
  })

  it('does not send X-User-Id header', () => {
    localStorageMock.setItem('smailo_user_id', 'user123')
    localStorageMock.setItem('smailo_token', 'global-jwt-123')
    const config = runInterceptor(makeConfig('/users'))
    expect(config.headers['X-User-Id']).toBeUndefined()
  })

  it('sends per-app JWT via X-App-Token for app routes', () => {
    localStorageMock.setItem('smailo_token', 'global-jwt')
    localStorageMock.setItem('smailo_token_abc123', 'app-jwt-456')
    const config = runInterceptor(makeConfig('/app/abc123/data'))
    expect(config.headers.Authorization).toBe('Bearer global-jwt')
    expect(config.headers['X-App-Token']).toBe('app-jwt-456')
  })

  it('does not send X-App-Token for non-app routes', () => {
    localStorageMock.setItem('smailo_token', 'global-jwt')
    localStorageMock.setItem('smailo_token_abc123', 'app-jwt-456')
    const config = runInterceptor(makeConfig('/users/test'))
    expect(config.headers.Authorization).toBe('Bearer global-jwt')
    expect(config.headers['X-App-Token']).toBeUndefined()
  })

  it('works with no tokens in localStorage', () => {
    const config = runInterceptor(makeConfig('/users'))
    expect(config.headers.Authorization).toBeUndefined()
    expect(config.headers['X-App-Token']).toBeUndefined()
  })
})
