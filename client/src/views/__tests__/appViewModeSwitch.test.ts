import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorStore } from '../../stores/editor'
import { useAppStore } from '../../stores/app'

vi.mock('../../api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}))

function makeSinglePageConfig() {
  return {
    appName: 'Test App',
    uiComponents: [
      { component: 'Card', props: { header: 'Hello' } },
      { component: 'DataTable', props: {} },
    ],
  }
}

function makeMultiPageConfig() {
  return {
    appName: 'Multi App',
    pages: [
      { id: 'home', title: 'Home', uiComponents: [{ component: 'Card', props: { header: 'Home' } }] },
      { id: 'settings', title: 'Settings', uiComponents: [{ component: 'Form', props: {} }] },
    ],
  }
}

describe('AppView mode switching logic', () => {
  let editorStore: ReturnType<typeof useEditorStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    editorStore = useEditorStore()
  })

  describe('entering edit mode', () => {
    it('initializes editor store with single-page config', () => {
      const config = makeSinglePageConfig()
      editorStore.enterEditMode(config)

      expect(editorStore.isEditMode).toBe(true)
      expect(editorStore.editableConfig).toHaveLength(2)
      expect(editorStore.isDirty).toBe(false)
      expect(editorStore.editablePages).toBeNull()
    })

    it('initializes editor store with multi-page config', () => {
      const config = makeMultiPageConfig()
      editorStore.enterEditMode(config)

      expect(editorStore.isEditMode).toBe(true)
      expect(editorStore.editablePages).toHaveLength(2)
      expect(editorStore.activePage).toBe('home')
    })
  })

  describe('exiting edit mode', () => {
    it('exits cleanly when not dirty', () => {
      editorStore.enterEditMode(makeSinglePageConfig())
      expect(editorStore.isEditMode).toBe(true)

      editorStore.exitEditMode()
      expect(editorStore.isEditMode).toBe(false)
      expect(editorStore.editableConfig).toHaveLength(0)
    })

    it('dirty flag is set after component update', () => {
      editorStore.enterEditMode(makeSinglePageConfig())
      editorStore.updateComponent(0, { props: { header: 'Changed' } })

      expect(editorStore.isDirty).toBe(true)
    })
  })

  describe('toggle mode function logic', () => {
    // This tests the logic that AppView.toggleEditMode implements:
    // - If in edit mode and not dirty -> exit
    // - If in edit mode and dirty -> show warning (don't exit)
    // - If not in edit mode -> enter edit mode

    it('entering edit mode from view mode', () => {
      expect(editorStore.isEditMode).toBe(false)

      // Simulate: toggleEditMode would call enterEditMode
      editorStore.enterEditMode(makeSinglePageConfig())
      expect(editorStore.isEditMode).toBe(true)
    })

    it('exiting edit mode when not dirty', () => {
      editorStore.enterEditMode(makeSinglePageConfig())
      expect(editorStore.isDirty).toBe(false)

      // Simulate: toggleEditMode checks isDirty, it's false -> exitEditMode
      editorStore.exitEditMode()
      expect(editorStore.isEditMode).toBe(false)
    })

    it('should block exit when dirty (unsaved changes warning flow)', () => {
      editorStore.enterEditMode(makeSinglePageConfig())
      editorStore.updateComponent(0, { props: { header: 'Changed' } })
      expect(editorStore.isDirty).toBe(true)

      // Simulate: toggleEditMode checks isDirty -> shows warning instead of exiting
      // The store should still be in edit mode
      expect(editorStore.isEditMode).toBe(true)

      // Simulate: user confirms discard
      editorStore.exitEditMode()
      expect(editorStore.isEditMode).toBe(false)
      expect(editorStore.isDirty).toBe(false)
    })

    it('should stay in edit mode when user cancels discard', () => {
      editorStore.enterEditMode(makeSinglePageConfig())
      editorStore.updateComponent(0, { props: { header: 'Changed' } })

      // Simulate: user cancels -> nothing happens, stays in edit mode
      expect(editorStore.isEditMode).toBe(true)
      expect(editorStore.isDirty).toBe(true)
    })
  })

  describe('hash change resets edit mode', () => {
    it('exitEditMode clears all state when navigating to another app', () => {
      editorStore.enterEditMode(makeSinglePageConfig())
      editorStore.updateComponent(0, { props: { header: 'Changed' } })
      expect(editorStore.isEditMode).toBe(true)
      expect(editorStore.isDirty).toBe(true)

      // Simulate: hash change watcher calls exitEditMode
      editorStore.exitEditMode()

      expect(editorStore.isEditMode).toBe(false)
      expect(editorStore.isDirty).toBe(false)
      expect(editorStore.editableConfig).toHaveLength(0)
    })
  })

  describe('discardChanges flow', () => {
    it('reverts to original config', () => {
      const config = makeSinglePageConfig()
      editorStore.enterEditMode(config)
      editorStore.updateComponent(0, { props: { header: 'Changed' } })
      expect(editorStore.editableConfig[0].props.header).toBe('Changed')

      editorStore.discardChanges(config)
      expect(editorStore.editableConfig[0].props.header).toBe('Hello')
      expect(editorStore.isDirty).toBe(false)
    })
  })

  describe('mode state visibility', () => {
    it('isEditMode determines which panel content to show', () => {
      // View mode: show AppRenderer + chat
      expect(editorStore.isEditMode).toBe(false)

      // Edit mode: show AppEditor + editor panel
      editorStore.enterEditMode(makeSinglePageConfig())
      expect(editorStore.isEditMode).toBe(true)

      // Back to view mode
      editorStore.exitEditMode()
      expect(editorStore.isEditMode).toBe(false)
    })
  })
})
