import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock sessionStorage before anything imports it
const sessionStore: Record<string, string> = {}
const sessionStorageMock = {
  getItem: (key: string) => sessionStore[key] ?? null,
  setItem: (key: string, value: string) => { sessionStore[key] = value },
  removeItem: (key: string) => { delete sessionStore[key] },
  clear: () => { for (const k of Object.keys(sessionStore)) delete sessionStore[k] },
  get length() { return Object.keys(sessionStore).length },
  key: (_i: number) => null as string | null,
}
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true })

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import api from '../../api'
import { useChatStore } from '../chat'

const mockPost = api.post as ReturnType<typeof vi.fn>
const mockGet = api.get as ReturnType<typeof vi.fn>

describe('useChatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    sessionStorageMock.clear()
  })

  describe('initSession', () => {
    it('sets sessionId to home-<userId>', () => {
      const store = useChatStore()
      store.initSession('abc123')
      expect(store.sessionId).toBe('home-abc123')
    })

    it('resets all state', () => {
      const store = useChatStore()
      // Dirty the state first
      store.messages.push({ role: 'user', content: 'hello' })
      store.mood = 'thinking'
      store.phase = 'confirm'
      store.appHash = 'somehash'
      store.appConfig = { appName: 'x', description: 'x', cronJobs: [], uiComponents: [] }
      store.creationToken = 'tok'
      sessionStorageMock.setItem('smailo_appHash', 'somehash')
      sessionStorageMock.setItem('smailo_creationToken', 'tok')

      store.initSession('user1')

      expect(store.messages).toEqual([])
      expect(store.mood).toBe('idle')
      expect(store.phase).toBe('brainstorm')
      expect(store.appHash).toBeNull()
      expect(store.appConfig).toBeNull()
      expect(store.creationToken).toBeNull()
      expect(sessionStorageMock.getItem('smailo_appHash')).toBeNull()
      expect(sessionStorageMock.getItem('smailo_creationToken')).toBeNull()
    })
  })

  describe('reset', () => {
    it('generates a new random session ID', () => {
      const store = useChatStore()
      const oldId = store.sessionId
      store.reset()
      expect(store.sessionId).not.toBe(oldId)
      // Should not be a deterministic home- session
      expect(store.sessionId).not.toMatch(/^home-/)
    })

    it('clears all state and sessionStorage', () => {
      const store = useChatStore()
      store.messages.push({ role: 'user', content: 'test' })
      store.mood = 'happy'
      store.phase = 'created'
      store.appHash = 'hash1'
      store.creationToken = 'ct1'
      sessionStorageMock.setItem('smailo_appHash', 'hash1')
      sessionStorageMock.setItem('smailo_creationToken', 'ct1')

      store.reset()

      expect(store.messages).toEqual([])
      expect(store.mood).toBe('idle')
      expect(store.phase).toBe('brainstorm')
      expect(store.appHash).toBeNull()
      expect(store.appConfig).toBeNull()
      expect(store.creationToken).toBeNull()
      expect(sessionStorageMock.getItem('smailo_appHash')).toBeNull()
      expect(sessionStorageMock.getItem('smailo_creationToken')).toBeNull()
    })
  })

  describe('sendMessage', () => {
    it('adds user message, then assistant message on success', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          message: 'AI reply',
          mood: 'happy',
          phase: 'brainstorm',
        },
      })

      const store = useChatStore()
      await store.sendMessage('hello')

      expect(store.messages).toHaveLength(2)
      expect(store.messages[0]).toEqual({ role: 'user', content: 'hello' })
      expect(store.messages[1]).toEqual({ role: 'assistant', content: 'AI reply', mood: 'happy' })
    })

    it('sets mood to thinking during request', async () => {
      let capturedMood = ''
      mockPost.mockImplementationOnce(() => {
        // Access store during the "request"
        const store = useChatStore()
        capturedMood = store.mood
        return Promise.resolve({ data: { message: 'ok', mood: 'idle' } })
      })

      const store = useChatStore()
      await store.sendMessage('test')
      expect(capturedMood).toBe('thinking')
    })

    it('updates phase from response', async () => {
      mockPost.mockResolvedValueOnce({
        data: { message: 'Confirm?', mood: 'idle', phase: 'confirm' },
      })

      const store = useChatStore()
      await store.sendMessage('make a tracker')
      expect(store.phase).toBe('confirm')
    })

    it('sets appHash and saves to sessionStorage on creation', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          message: 'Created!',
          mood: 'happy',
          phase: 'created',
          appHash: 'abc123hash',
          creationToken: 'secret-token',
        },
      })

      const store = useChatStore()
      await store.sendMessage('yes create it')

      expect(store.appHash).toBe('abc123hash')
      expect(store.creationToken).toBe('secret-token')
      expect(sessionStorageMock.getItem('smailo_appHash')).toBe('abc123hash')
      expect(sessionStorageMock.getItem('smailo_creationToken')).toBe('secret-token')
    })

    it('stores appConfig from response', async () => {
      const config = { appName: 'Tracker', description: 'A tracker', cronJobs: [], uiComponents: [] }
      mockPost.mockResolvedValueOnce({
        data: { message: 'Here is the config', mood: 'idle', appConfig: config },
      })

      const store = useChatStore()
      await store.sendMessage('show me')

      expect(store.appConfig).toEqual(config)
      expect(store.messages[1].appConfig).toEqual(config)
    })

    it('includes userId in request when provided', async () => {
      mockPost.mockResolvedValueOnce({
        data: { message: 'ok', mood: 'idle' },
      })

      const store = useChatStore()
      await store.sendMessage('hi', 'user42')

      expect(mockPost).toHaveBeenCalledWith('/chat', {
        sessionId: store.sessionId,
        message: 'hi',
        userId: 'user42',
      })
    })

    it('removes user message and sets mood to confused on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'))

      const store = useChatStore()
      await expect(store.sendMessage('hello')).rejects.toThrow('Network error')

      expect(store.messages).toHaveLength(0)
      expect(store.mood).toBe('confused')
    })
  })

  describe('loadHistory', () => {
    it('loads messages from API', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          history: [
            { role: 'user', content: 'hi', phase: 'brainstorm' },
            { role: 'assistant', content: 'hello!', phase: 'brainstorm' },
          ],
        },
      })

      const store = useChatStore()
      store.initSession('user1')
      await store.loadHistory()

      expect(store.messages).toHaveLength(2)
      expect(store.messages[0]).toEqual({ role: 'user', content: 'hi' })
      expect(store.messages[1]).toEqual({ role: 'assistant', content: 'hello!' })
    })

    it('restores phase from last assistant message', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          history: [
            { role: 'user', content: 'make app' },
            { role: 'assistant', content: 'confirm?', phase: 'confirm' },
          ],
        },
      })

      const store = useChatStore()
      store.initSession('user1')
      await store.loadHistory()

      expect(store.phase).toBe('confirm')
    })

    it('skips loading if last assistant phase is created', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          history: [
            { role: 'user', content: 'yes' },
            { role: 'assistant', content: 'done!', phase: 'created' },
          ],
        },
      })

      const store = useChatStore()
      store.initSession('user1')
      await store.loadHistory()

      expect(store.messages).toHaveLength(0)
      expect(store.phase).toBe('brainstorm')
    })

    it('sends userId param extracted from deterministic session ID', async () => {
      mockGet.mockResolvedValueOnce({ data: { history: [] } })

      const store = useChatStore()
      store.initSession('abc123')
      await store.loadHistory()

      expect(mockGet).toHaveBeenCalledWith('/chat', {
        params: { sessionId: 'home-abc123', userId: 'abc123' },
      })
    })

    it('does not send userId for non-deterministic session IDs', async () => {
      mockGet.mockResolvedValueOnce({ data: { history: [] } })

      const store = useChatStore()
      // sessionId is random by default (not home-)
      await store.loadHistory()

      expect(mockGet).toHaveBeenCalledWith('/chat', {
        params: { sessionId: store.sessionId, userId: undefined },
      })
    })

    it('silently ignores API errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server down'))

      const store = useChatStore()
      store.initSession('user1')
      await store.loadHistory() // Should not throw

      expect(store.messages).toHaveLength(0)
    })

    it('handles empty history', async () => {
      mockGet.mockResolvedValueOnce({ data: { history: [] } })

      const store = useChatStore()
      store.initSession('user1')
      await store.loadHistory()

      expect(store.messages).toHaveLength(0)
    })

    it('handles missing history field', async () => {
      mockGet.mockResolvedValueOnce({ data: {} })

      const store = useChatStore()
      store.initSession('user1')
      await store.loadHistory()

      expect(store.messages).toHaveLength(0)
    })
  })
})
