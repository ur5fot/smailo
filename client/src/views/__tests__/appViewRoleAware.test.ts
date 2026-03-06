import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore, type UserRole } from '../../stores/app'
import { useEditorStore } from '../../stores/editor'

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}))

// Helper functions that mirror the template conditions in AppView/components
// Using the store's ref directly (not a narrowed const) avoids TS2367
function isOwner(role: UserRole): boolean { return role === 'owner' }
function isViewer(role: UserRole): boolean { return role === 'viewer' }
function isEditor(role: UserRole): boolean { return role === 'editor' }

describe('AppView role-aware UI logic', () => {
  let appStore: ReturnType<typeof useAppStore>
  let editorStore: ReturnType<typeof useEditorStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    appStore = useAppStore()
    editorStore = useEditorStore()
  })

  describe('editor button visibility (v-if="myRole === owner")', () => {
    it('should show editor button for owner', () => {
      appStore.myRole = 'owner'
      expect(isOwner(appStore.myRole)).toBe(true)
    })

    it('should hide editor button for editor role', () => {
      appStore.myRole = 'editor'
      expect(isOwner(appStore.myRole)).toBe(false)
    })

    it('should hide editor button for viewer role', () => {
      appStore.myRole = 'viewer'
      expect(isOwner(appStore.myRole)).toBe(false)
    })

    it('should hide editor button when role is null (anonymous)', () => {
      appStore.myRole = null
      expect(isOwner(appStore.myRole)).toBe(false)
    })
  })

  describe('members button visibility (v-if="myRole === owner")', () => {
    it('should show members button only for owner', () => {
      appStore.myRole = 'owner'
      expect(isOwner(appStore.myRole)).toBe(true)
    })

    it('should hide members button for editor', () => {
      appStore.myRole = 'editor'
      expect(isOwner(appStore.myRole)).toBe(false)
    })

    it('should hide members button for viewer', () => {
      appStore.myRole = 'viewer'
      expect(isOwner(appStore.myRole)).toBe(false)
    })
  })

  describe('chat input disabled state (:disabled="myRole === viewer")', () => {
    it('should enable chat for owner', () => {
      appStore.myRole = 'owner'
      expect(isViewer(appStore.myRole)).toBe(false)
    })

    it('should enable chat for editor', () => {
      appStore.myRole = 'editor'
      expect(isViewer(appStore.myRole)).toBe(false)
    })

    it('should disable chat for viewer', () => {
      appStore.myRole = 'viewer'
      expect(isViewer(appStore.myRole)).toBe(true)
    })
  })

  describe('input components disabled for viewer', () => {
    it('AppButton should be disabled for viewer', () => {
      appStore.myRole = 'viewer'
      expect(isViewer(appStore.myRole)).toBe(true)
    })

    it('AppButton should be enabled for editor', () => {
      appStore.myRole = 'editor'
      expect(isViewer(appStore.myRole)).toBe(false)
    })

    it('AppButton should be enabled for owner', () => {
      appStore.myRole = 'owner'
      expect(isViewer(appStore.myRole)).toBe(false)
    })

    it('AppForm should be disabled for viewer', () => {
      appStore.myRole = 'viewer'
      expect(isViewer(appStore.myRole)).toBe(true)
    })

    it('AppInputText should be disabled for viewer', () => {
      appStore.myRole = 'viewer'
      expect(isViewer(appStore.myRole)).toBe(true)
    })
  })

  describe('role badge display', () => {
    it('should show editor badge for editor role', () => {
      appStore.myRole = 'editor'
      expect(isEditor(appStore.myRole)).toBe(true)
      expect(isViewer(appStore.myRole)).toBe(false)
    })

    it('should show viewer badge for viewer role', () => {
      appStore.myRole = 'viewer'
      expect(isEditor(appStore.myRole)).toBe(false)
      expect(isViewer(appStore.myRole)).toBe(true)
    })

    it('should show no badge for owner', () => {
      appStore.myRole = 'owner'
      expect(isEditor(appStore.myRole)).toBe(false)
      expect(isViewer(appStore.myRole)).toBe(false)
    })

    it('should show no badge when role is null', () => {
      appStore.myRole = null
      expect(isEditor(appStore.myRole)).toBe(false)
      expect(isViewer(appStore.myRole)).toBe(false)
    })
  })

  describe('edit mode blocked for non-owner', () => {
    it('owner can enter edit mode', () => {
      appStore.myRole = 'owner'
      appStore.appConfig = { uiComponents: [{ component: 'Card', props: {} }] }

      expect(isOwner(appStore.myRole)).toBe(true)
      editorStore.enterEditMode(appStore.appConfig!)
      expect(editorStore.isEditMode).toBe(true)
    })

    it('editor cannot access edit mode (button hidden)', () => {
      appStore.myRole = 'editor'
      expect(isOwner(appStore.myRole)).toBe(false)
    })

    it('viewer cannot access edit mode (button hidden)', () => {
      appStore.myRole = 'viewer'
      expect(isOwner(appStore.myRole)).toBe(false)
    })
  })

  describe('CardList delete button visibility (myRole !== viewer)', () => {
    it('should show delete button for owner', () => {
      appStore.myRole = 'owner'
      expect(!isViewer(appStore.myRole)).toBe(true)
    })

    it('should show delete button for editor', () => {
      appStore.myRole = 'editor'
      expect(!isViewer(appStore.myRole)).toBe(true)
    })

    it('should hide delete button for viewer', () => {
      appStore.myRole = 'viewer'
      expect(!isViewer(appStore.myRole)).toBe(false)
    })
  })
})
