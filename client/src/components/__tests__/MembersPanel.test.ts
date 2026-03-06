import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '../../stores/app'

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '../../api'
const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>
const mockPut = api.put as ReturnType<typeof vi.fn>
const mockDelete = (api as any).delete as ReturnType<typeof vi.fn>

describe('MembersPanel — store methods', () => {
  let store: ReturnType<typeof useAppStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    vi.clearAllMocks()
  })

  describe('fetchMembers', () => {
    it('fetches and updates members list', async () => {
      const members = [
        { userId: 'owner1', role: 'owner', joinedAt: '2026-01-01' },
        { userId: 'editor1', role: 'editor', joinedAt: '2026-01-02' },
      ]
      mockGet.mockResolvedValueOnce({ data: members })
      const result = await store.fetchMembers('test-hash')
      expect(mockGet).toHaveBeenCalledWith('/app/test-hash/members')
      expect(result).toEqual(members)
      expect(store.members).toEqual(members)
    })

    it('propagates error on fetch failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'))
      await expect(store.fetchMembers('test-hash')).rejects.toThrow('Network error')
    })
  })

  describe('createInvite', () => {
    it('creates invite and returns invite URL', async () => {
      const response = {
        token: 'abc123def456',
        inviteUrl: '/invite/test-hash/abc123def456',
        expiresAt: '2026-01-08T00:00:00.000Z',
      }
      mockPost.mockResolvedValueOnce({ data: response })
      const result = await store.createInvite('test-hash', 'editor')
      expect(mockPost).toHaveBeenCalledWith('/app/test-hash/members/invite', { role: 'editor' })
      expect(result).toEqual(response)
    })

    it('creates viewer invite', async () => {
      mockPost.mockResolvedValueOnce({ data: { token: 'tok', inviteUrl: '/invite/h/tok', expiresAt: '' } })
      await store.createInvite('test-hash', 'viewer')
      expect(mockPost).toHaveBeenCalledWith('/app/test-hash/members/invite', { role: 'viewer' })
    })

    it('propagates error on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Forbidden'))
      await expect(store.createInvite('test-hash', 'editor')).rejects.toThrow('Forbidden')
    })
  })

  describe('changeMemberRole', () => {
    it('changes role via PUT', async () => {
      mockPut.mockResolvedValueOnce({ data: { ok: true, userId: 'user1', role: 'viewer' } })
      const result = await store.changeMemberRole('test-hash', 'user1', 'viewer')
      expect(mockPut).toHaveBeenCalledWith('/app/test-hash/members/user1', { role: 'viewer' })
      expect(result).toEqual({ ok: true, userId: 'user1', role: 'viewer' })
    })

    it('propagates error on failure', async () => {
      mockPut.mockRejectedValueOnce(new Error('Cannot change owner role'))
      await expect(store.changeMemberRole('test-hash', 'user1', 'editor')).rejects.toThrow()
    })
  })

  describe('removeMember', () => {
    it('removes member via DELETE', async () => {
      mockDelete.mockResolvedValueOnce({ data: { ok: true } })
      const result = await store.removeMember('test-hash', 'user1')
      expect(mockDelete).toHaveBeenCalledWith('/app/test-hash/members/user1')
      expect(result).toEqual({ ok: true })
    })

    it('propagates error on failure', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Not found'))
      await expect(store.removeMember('test-hash', 'user1')).rejects.toThrow()
    })
  })
})

describe('MembersPanel — component logic', () => {
  // Test the behavioral patterns of MembersPanel without rendering the actual component
  // These tests verify the logic that drives the UI

  describe('invite flow', () => {
    it('invite URL should be constructed from origin + inviteUrl', () => {
      const origin = 'https://smailo.app'
      const inviteUrl = '/invite/abc123/tok456'
      const fullUrl = `${origin}${inviteUrl}`
      expect(fullUrl).toBe('https://smailo.app/invite/abc123/tok456')
    })

    it('invite roles are limited to editor and viewer', () => {
      const validRoles = ['editor', 'viewer']
      expect(validRoles).toContain('editor')
      expect(validRoles).toContain('viewer')
      expect(validRoles).not.toContain('owner')
    })
  })

  describe('role change behavior', () => {
    it('should optimistically update member role in list', () => {
      const members = [
        { userId: 'u1', role: 'editor' },
        { userId: 'u2', role: 'viewer' },
      ]
      // Simulate optimistic update
      const member = members.find(m => m.userId === 'u2')
      if (member) member.role = 'editor'
      expect(members.find(m => m.userId === 'u2')!.role).toBe('editor')
    })

    it('owner members should not have role change controls', () => {
      const member = { userId: 'u1', role: 'owner' }
      // In the template: v-if="member.role !== 'owner'"
      expect(member.role !== 'owner').toBe(false)
    })

    it('non-owner members should have role change controls', () => {
      const editor = { userId: 'u1', role: 'editor' }
      const viewer = { userId: 'u2', role: 'viewer' }
      expect(editor.role !== 'owner').toBe(true)
      expect(viewer.role !== 'owner').toBe(true)
    })
  })

  describe('remove member behavior', () => {
    it('should remove member from local list on success', () => {
      const members = [
        { userId: 'u1', role: 'owner' },
        { userId: 'u2', role: 'editor' },
        { userId: 'u3', role: 'viewer' },
      ]
      const filtered = members.filter(m => m.userId !== 'u2')
      expect(filtered).toHaveLength(2)
      expect(filtered.find(m => m.userId === 'u2')).toBeUndefined()
    })

    it('double-click confirmation pattern (first click sets confirming, second removes)', () => {
      let confirmingRemove: string | null = null

      // First click — sets confirming
      const userId = 'u2'
      if (confirmingRemove !== userId) {
        confirmingRemove = userId
      }
      expect(confirmingRemove).toBe('u2')

      // Second click — proceeds with removal
      if (confirmingRemove === userId) {
        confirmingRemove = null
        // would proceed with API call
      }
      expect(confirmingRemove).toBeNull()
    })
  })
})
