import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useEditorStore, type UiComponent, type PageConfig } from '../editor'

vi.mock('../../api', () => ({
  default: {
    put: vi.fn(),
  },
}))

import api from '../../api'
const mockPut = api.put as ReturnType<typeof vi.fn>

function makeComponent(overrides: Partial<UiComponent> = {}): UiComponent {
  return { component: 'Card', props: { header: 'Test' }, ...overrides }
}

function makeSinglePageConfig(): Record<string, unknown> {
  return {
    appName: 'Test',
    uiComponents: [
      makeComponent({ component: 'Card' }),
      makeComponent({ component: 'DataTable' }),
      makeComponent({ component: 'Button', actions: [{ type: 'writeData', key: 'x', value: 1 }] }),
    ],
  }
}

function makeMultiPageConfig(): Record<string, unknown> {
  return {
    appName: 'Multi',
    pages: [
      { id: 'main', title: 'Main', uiComponents: [makeComponent({ component: 'Card' }), makeComponent({ component: 'Chart' })] },
      { id: 'settings', title: 'Settings', uiComponents: [makeComponent({ component: 'Form' })] },
    ] as PageConfig[],
  }
}

describe('useEditorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('enterEditMode / exitEditMode', () => {
    it('enters edit mode with single-page config', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())

      expect(store.isEditMode).toBe(true)
      expect(store.isDirty).toBe(false)
      expect(store.editableConfig).toHaveLength(3)
      expect(store.editablePages).toBeNull()
      expect(store.activePage).toBeNull()
      expect(store.selectedComponentIndex).toBeNull()
    })

    it('enters edit mode with multi-page config', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())

      expect(store.isEditMode).toBe(true)
      expect(store.editablePages).toHaveLength(2)
      expect(store.activePage).toBe('main')
      expect(store.editableConfig).toHaveLength(0)
    })

    it('deep-clones config (no shared references)', () => {
      const config = makeSinglePageConfig()
      const original = (config.uiComponents as UiComponent[])[0]
      const store = useEditorStore()
      store.enterEditMode(config)

      store.editableConfig[0].props.header = 'Modified'
      expect(original.props.header).toBe('Test')
    })

    it('exitEditMode resets all state', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(1)
      store.updateComponent(0, { props: { header: 'Changed' } })

      store.exitEditMode()

      expect(store.isEditMode).toBe(false)
      expect(store.isDirty).toBe(false)
      expect(store.selectedComponentIndex).toBeNull()
      expect(store.editableConfig).toHaveLength(0)
      expect(store.editablePages).toBeNull()
      expect(store.activePage).toBeNull()
    })

    it('handles empty uiComponents', () => {
      const store = useEditorStore()
      store.enterEditMode({ appName: 'Empty', uiComponents: [] })
      expect(store.editableConfig).toHaveLength(0)
    })

    it('handles missing uiComponents', () => {
      const store = useEditorStore()
      store.enterEditMode({ appName: 'NoUI' })
      expect(store.editableConfig).toHaveLength(0)
    })
  })

  describe('selectComponent', () => {
    it('selects a component by index', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(1)
      expect(store.selectedComponentIndex).toBe(1)
    })

    it('deselects with null', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(1)
      store.selectComponent(null)
      expect(store.selectedComponentIndex).toBeNull()
    })
  })

  describe('selectedComponent getter', () => {
    it('returns selected component', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(0)
      expect(store.selectedComponent?.component).toBe('Card')
    })

    it('returns null when nothing selected', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      expect(store.selectedComponent).toBeNull()
    })

    it('returns null for out-of-bounds index', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(99)
      expect(store.selectedComponent).toBeNull()
    })
  })

  describe('updateComponent', () => {
    it('updates component props', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.updateComponent(0, { props: { header: 'Updated' } })

      expect(store.editableConfig[0].props.header).toBe('Updated')
      expect(store.isDirty).toBe(true)
    })

    it('merges partial update with existing component', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.updateComponent(0, { dataKey: 'myKey' })

      expect(store.editableConfig[0].component).toBe('Card')
      expect(store.editableConfig[0].dataKey).toBe('myKey')
    })

    it('ignores invalid index', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.updateComponent(-1, { props: {} })
      store.updateComponent(99, { props: {} })
      expect(store.isDirty).toBe(false)
    })
  })

  describe('removeComponent', () => {
    it('removes component at index', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.removeComponent(1)

      expect(store.editableConfig).toHaveLength(2)
      expect(store.editableConfig[0].component).toBe('Card')
      expect(store.editableConfig[1].component).toBe('Button')
      expect(store.isDirty).toBe(true)
    })

    it('clears selection when selected component is removed', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(1)
      store.removeComponent(1)
      expect(store.selectedComponentIndex).toBeNull()
    })

    it('adjusts selection when component before selected is removed', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(2)
      store.removeComponent(0)
      expect(store.selectedComponentIndex).toBe(1)
    })

    it('does not adjust selection when component after selected is removed', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(0)
      store.removeComponent(2)
      expect(store.selectedComponentIndex).toBe(0)
    })

    it('ignores invalid index', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.removeComponent(-1)
      store.removeComponent(99)
      expect(store.editableConfig).toHaveLength(3)
      expect(store.isDirty).toBe(false)
    })
  })

  describe('addComponent', () => {
    it('appends component when no index given', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.addComponent(makeComponent({ component: 'Badge' }))

      expect(store.editableConfig).toHaveLength(4)
      expect(store.editableConfig[3].component).toBe('Badge')
      expect(store.isDirty).toBe(true)
    })

    it('inserts component at specific index', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.addComponent(makeComponent({ component: 'Badge' }), 1)

      expect(store.editableConfig).toHaveLength(4)
      expect(store.editableConfig[1].component).toBe('Badge')
      expect(store.editableConfig[2].component).toBe('DataTable')
    })

    it('inserts at beginning with index 0', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.addComponent(makeComponent({ component: 'Badge' }), 0)

      expect(store.editableConfig[0].component).toBe('Badge')
      expect(store.editableConfig).toHaveLength(4)
    })
  })

  describe('moveComponent', () => {
    it('moves component forward', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.moveComponent(0, 2)

      expect(store.editableConfig[0].component).toBe('DataTable')
      expect(store.editableConfig[1].component).toBe('Button')
      expect(store.editableConfig[2].component).toBe('Card')
      expect(store.isDirty).toBe(true)
    })

    it('moves component backward', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.moveComponent(2, 0)

      expect(store.editableConfig[0].component).toBe('Button')
      expect(store.editableConfig[1].component).toBe('Card')
      expect(store.editableConfig[2].component).toBe('DataTable')
    })

    it('updates selection to follow moved component', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.selectComponent(0)
      store.moveComponent(0, 2)
      expect(store.selectedComponentIndex).toBe(2)
    })

    it('no-op when from equals to', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.moveComponent(1, 1)
      expect(store.isDirty).toBe(false)
    })

    it('ignores invalid indices', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.moveComponent(-1, 2)
      store.moveComponent(0, 99)
      expect(store.isDirty).toBe(false)
    })
  })

  describe('updateLayout', () => {
    it('sets layout on a component', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.updateLayout(0, { col: 1, colSpan: 6 })

      expect(store.editableConfig[0].layout).toEqual({ col: 1, colSpan: 6 })
      expect(store.isDirty).toBe(true)
    })

    it('replaces existing layout', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.updateLayout(0, { col: 1, colSpan: 6 })
      store.updateLayout(0, { col: 3, colSpan: 4, row: 2 })

      expect(store.editableConfig[0].layout).toEqual({ col: 3, colSpan: 4, row: 2 })
    })

    it('ignores invalid index', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.updateLayout(99, { col: 1, colSpan: 6 })
      expect(store.isDirty).toBe(false)
    })
  })

  describe('saveConfig', () => {
    it('saves single-page config via PUT API', async () => {
      mockPut.mockResolvedValueOnce({ data: { ok: true, config: {} } })
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      store.updateComponent(0, { props: { header: 'Saved' } })

      await store.saveConfig('abc123')

      expect(mockPut).toHaveBeenCalledWith('/app/abc123/config', {
        uiComponents: store.editableConfig,
      })
      expect(store.isDirty).toBe(false)
    })

    it('saves multi-page config via PUT API', async () => {
      mockPut.mockResolvedValueOnce({ data: { ok: true, config: {} } })
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())

      await store.saveConfig('abc123')

      expect(mockPut).toHaveBeenCalledWith('/app/abc123/config', {
        pages: store.editablePages,
      })
      expect(store.isDirty).toBe(false)
    })
  })

  describe('multi-page support', () => {
    it('currentPageComponents returns active page components', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())

      expect(store.currentPageComponents).toHaveLength(2)
      expect(store.currentPageComponents[0].component).toBe('Card')
    })

    it('setActivePage switches to another page', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())
      store.selectComponent(0)
      store.setActivePage('settings')

      expect(store.activePage).toBe('settings')
      expect(store.selectedComponentIndex).toBeNull()
      expect(store.currentPageComponents).toHaveLength(1)
      expect(store.currentPageComponents[0].component).toBe('Form')
    })

    it('setActivePage ignores invalid page id', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())
      store.setActivePage('nonexistent')
      expect(store.activePage).toBe('main')
    })

    it('isMultiPage getter returns true for multi-page', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())
      expect(store.isMultiPage).toBe(true)
    })

    it('isMultiPage getter returns false for single-page', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      expect(store.isMultiPage).toBe(false)
    })

    it('operations affect active page components', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())
      store.setActivePage('settings')
      store.addComponent(makeComponent({ component: 'Badge' }))

      expect(store.editablePages![1].uiComponents).toHaveLength(2)
      // Main page unchanged
      expect(store.editablePages![0].uiComponents).toHaveLength(2)
    })

    it('removeComponent on active page only', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())
      store.removeComponent(0)

      expect(store.editablePages![0].uiComponents).toHaveLength(1)
      expect(store.editablePages![0].uiComponents[0].component).toBe('Chart')
      // Settings page unchanged
      expect(store.editablePages![1].uiComponents).toHaveLength(1)
    })
  })

  describe('replaceCurrentComponents', () => {
    it('replaces components in single-page mode', () => {
      const store = useEditorStore()
      store.enterEditMode(makeSinglePageConfig())
      const newComponents = [makeComponent({ component: 'Badge' }), makeComponent({ component: 'Chart' })]
      store.replaceCurrentComponents(newComponents)

      expect(store.editableConfig).toHaveLength(2)
      expect(store.editableConfig[0].component).toBe('Badge')
      expect(store.editableConfig[1].component).toBe('Chart')
      expect(store.isDirty).toBe(true)
    })

    it('replaces components in multi-page mode (active page only)', () => {
      const store = useEditorStore()
      store.enterEditMode(makeMultiPageConfig())
      const newComponents = [makeComponent({ component: 'Image' })]
      store.replaceCurrentComponents(newComponents)

      // Active page (main) should be replaced
      expect(store.editablePages![0].uiComponents).toHaveLength(1)
      expect(store.editablePages![0].uiComponents[0].component).toBe('Image')
      // Other page unchanged
      expect(store.editablePages![1].uiComponents).toHaveLength(1)
      expect(store.isDirty).toBe(true)
    })
  })

  describe('discardChanges', () => {
    it('resets to original config', () => {
      const config = makeSinglePageConfig()
      const store = useEditorStore()
      store.enterEditMode(config)
      store.updateComponent(0, { props: { header: 'Changed' } })
      expect(store.isDirty).toBe(true)

      store.discardChanges(config)
      expect(store.isDirty).toBe(false)
      expect(store.editableConfig[0].props.header).toBe('Test')
    })
  })
})
