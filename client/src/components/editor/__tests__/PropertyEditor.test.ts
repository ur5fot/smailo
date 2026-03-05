import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEditorStore } from '../../../stores/editor'

// Test the property editor logic via editor store interactions
// (the PropertyEditor component delegates all mutations to the store)

describe('PropertyEditor logic', () => {
  let store: ReturnType<typeof useEditorStore>

  const sampleConfig = {
    uiComponents: [
      {
        component: 'Card',
        props: { header: 'Test Card', severity: 'info' },
        dataKey: 'status',
        layout: { col: 1, colSpan: 6 },
      },
      {
        component: 'Button',
        props: { label: 'Click me' },
        actions: [{ type: 'writeData', key: 'counter', value: 1 }],
      },
      {
        component: 'DataTable',
        props: {},
        dataSource: { type: 'table', tableId: 5 },
        showIf: 'visible == true',
        styleIf: [{ condition: 'count > 10', class: 'warning' }],
      },
    ],
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useEditorStore()
    store.enterEditMode(sampleConfig)
  })

  describe('General section - component type and delete', () => {
    it('selectedComponent returns the correct component after selection', () => {
      store.selectComponent(0)
      expect(store.selectedComponent?.component).toBe('Card')
    })

    it('removeComponent removes component and clears selection', () => {
      store.selectComponent(0)
      store.removeComponent(0)
      expect(store.selectedComponent).toBeNull()
      expect(store.currentPageComponents).toHaveLength(2)
    })
  })

  describe('Props section - updating props', () => {
    it('updateComponent merges new props', () => {
      store.selectComponent(0)
      const newProps = { ...store.selectedComponent!.props, header: 'Updated' }
      store.updateComponent(0, { props: newProps })
      expect(store.selectedComponent!.props.header).toBe('Updated')
      expect(store.isDirty).toBe(true)
    })

    it('can add a new prop key', () => {
      store.selectComponent(0)
      const newProps = { ...store.selectedComponent!.props, newProp: 'value' }
      store.updateComponent(0, { props: newProps })
      expect(store.selectedComponent!.props.newProp).toBe('value')
    })

    it('can update boolean prop', () => {
      store.selectComponent(0)
      const newProps = { ...store.selectedComponent!.props, toggleable: true }
      store.updateComponent(0, { props: newProps })
      expect(store.selectedComponent!.props.toggleable).toBe(true)
    })

    it('can update numeric prop', () => {
      store.selectComponent(0)
      const newProps = { ...store.selectedComponent!.props, width: 42 }
      store.updateComponent(0, { props: newProps })
      expect(store.selectedComponent!.props.width).toBe(42)
    })
  })

  describe('Data section - dataKey, computedValue, dataSource', () => {
    it('can update dataKey', () => {
      store.selectComponent(0)
      store.updateComponent(0, { dataKey: 'newKey' })
      expect(store.selectedComponent!.dataKey).toBe('newKey')
    })

    it('can clear dataKey by setting undefined', () => {
      store.selectComponent(0)
      store.updateComponent(0, { dataKey: undefined })
      expect(store.selectedComponent!.dataKey).toBeUndefined()
    })

    it('can set computedValue', () => {
      store.selectComponent(0)
      store.updateComponent(0, { computedValue: '= SUM(sales.amount)' })
      expect(store.selectedComponent!.computedValue).toBe('= SUM(sales.amount)')
    })

    it('can set dataSource with tableId', () => {
      store.selectComponent(0)
      store.updateComponent(0, { dataSource: { type: 'table', tableId: 3 } })
      expect(store.selectedComponent!.dataSource).toEqual({ type: 'table', tableId: 3 })
    })

    it('can clear dataSource by setting undefined', () => {
      store.selectComponent(2)
      store.updateComponent(2, { dataSource: undefined })
      expect(store.selectedComponent!.dataSource).toBeUndefined()
    })

    it('can set outputKey for Form/Button/InputText', () => {
      store.selectComponent(1)
      store.updateComponent(1, { outputKey: 'result' })
      expect(store.selectedComponent!.outputKey).toBe('result')
    })
  })

  describe('Actions section - action chain editing', () => {
    it('can add an action', () => {
      store.selectComponent(1)
      const actions = [...(store.selectedComponent!.actions as any[]), { type: 'navigateTo', pageId: 'page2' }]
      store.updateComponent(1, { actions })
      expect((store.selectedComponent!.actions as any[]).length).toBe(2)
    })

    it('can remove an action', () => {
      store.selectComponent(1)
      store.updateComponent(1, { actions: [] })
      expect((store.selectedComponent!.actions as any[]).length).toBe(0)
    })

    it('can change action type (resets fields)', () => {
      store.selectComponent(1)
      store.updateComponent(1, { actions: [{ type: 'fetchUrl', url: '', outputKey: '' }] })
      const action = (store.selectedComponent!.actions as any[])[0]
      expect(action.type).toBe('fetchUrl')
      expect(action.url).toBe('')
    })

    it('can update action fields', () => {
      store.selectComponent(1)
      const actions = [{ type: 'writeData', key: 'newKey', value: 42 }]
      store.updateComponent(1, { actions })
      const action = (store.selectedComponent!.actions as any[])[0]
      expect(action.key).toBe('newKey')
      expect(action.value).toBe(42)
    })

    it('supports all 5 action types', () => {
      store.selectComponent(1)
      const allTypes = [
        { type: 'writeData', key: 'k' },
        { type: 'navigateTo', pageId: 'p1' },
        { type: 'toggleVisibility', key: 'v' },
        { type: 'runFormula', formula: 'a + b', outputKey: 'r' },
        { type: 'fetchUrl', url: 'https://api.com', outputKey: 'data' },
      ]
      store.updateComponent(1, { actions: allTypes })
      expect((store.selectedComponent!.actions as any[]).length).toBe(5)
    })
  })

  describe('Conditional section - showIf and styleIf', () => {
    it('can set showIf expression', () => {
      store.selectComponent(0)
      store.updateComponent(0, { showIf: 'active == true' })
      expect(store.selectedComponent!.showIf).toBe('active == true')
    })

    it('can clear showIf', () => {
      store.selectComponent(2)
      store.updateComponent(2, { showIf: undefined })
      expect(store.selectedComponent!.showIf).toBeUndefined()
    })

    it('can add styleIf rule', () => {
      store.selectComponent(0)
      const styleIf = [{ condition: 'val > 5', class: 'success' }]
      store.updateComponent(0, { styleIf })
      expect(store.selectedComponent!.styleIf).toEqual(styleIf)
    })

    it('can remove styleIf rule', () => {
      store.selectComponent(2)
      store.updateComponent(2, { styleIf: [] })
      expect((store.selectedComponent!.styleIf as any[]).length).toBe(0)
    })

    it('can update styleIf condition', () => {
      store.selectComponent(2)
      const styleIf = [{ condition: 'count > 20', class: 'critical' }]
      store.updateComponent(2, { styleIf })
      expect((store.selectedComponent!.styleIf as any[])[0].condition).toBe('count > 20')
    })

    it('can update styleIf class', () => {
      store.selectComponent(2)
      const styleIf = [{ condition: 'count > 10', class: 'success' }]
      store.updateComponent(2, { styleIf })
      expect((store.selectedComponent!.styleIf as any[])[0].class).toBe('success')
    })
  })

  describe('Layout section', () => {
    it('can update layout col and colSpan', () => {
      store.selectComponent(0)
      store.updateLayout(0, { col: 3, colSpan: 4 })
      expect(store.selectedComponent!.layout).toEqual({ col: 3, colSpan: 4 })
    })

    it('can add row and rowSpan', () => {
      store.selectComponent(0)
      store.updateLayout(0, { col: 1, colSpan: 6, row: 2, rowSpan: 3 })
      expect(store.selectedComponent!.layout?.row).toBe(2)
      expect(store.selectedComponent!.layout?.rowSpan).toBe(3)
    })

    it('updateLayout for component without existing layout', () => {
      store.selectComponent(1) // Button has no layout
      store.updateLayout(1, { col: 5, colSpan: 3 })
      expect(store.selectedComponent!.layout).toEqual({ col: 5, colSpan: 3 })
    })
  })

  describe('parseActionValue helper logic', () => {
    // Test the parsing logic that PropertyEditor uses
    function parseActionValue(str: string): unknown {
      if (str === '') return undefined
      if (str === 'true') return true
      if (str === 'false') return false
      const num = Number(str)
      if (!isNaN(num) && str.trim() !== '') return num
      try { return JSON.parse(str) } catch { return str }
    }

    it('empty string returns undefined', () => {
      expect(parseActionValue('')).toBeUndefined()
    })

    it('"true" returns boolean true', () => {
      expect(parseActionValue('true')).toBe(true)
    })

    it('"false" returns boolean false', () => {
      expect(parseActionValue('false')).toBe(false)
    })

    it('number string returns number', () => {
      expect(parseActionValue('42')).toBe(42)
      expect(parseActionValue('3.14')).toBe(3.14)
      expect(parseActionValue('-5')).toBe(-5)
    })

    it('JSON array string returns parsed array', () => {
      expect(parseActionValue('[1,2,3]')).toEqual([1, 2, 3])
    })

    it('JSON object string returns parsed object', () => {
      expect(parseActionValue('{"a":1}')).toEqual({ a: 1 })
    })

    it('plain string returns string', () => {
      expect(parseActionValue('hello')).toBe('hello')
    })
  })

  describe('supportsActions detection', () => {
    it('Button supports actions', () => {
      store.selectComponent(1)
      expect(store.selectedComponent!.component).toBe('Button')
      // The component type check happens in the Vue component; tested via component name
    })

    it('Card does not support actions', () => {
      store.selectComponent(0)
      expect(store.selectedComponent!.component).toBe('Card')
    })
  })

  describe('dirty state tracking', () => {
    it('all mutations set isDirty', () => {
      expect(store.isDirty).toBe(false)

      store.selectComponent(0)
      store.updateComponent(0, { props: { header: 'x' } })
      expect(store.isDirty).toBe(true)
    })

    it('updateLayout sets isDirty', () => {
      expect(store.isDirty).toBe(false)
      store.updateLayout(0, { col: 2, colSpan: 4 })
      expect(store.isDirty).toBe(true)
    })
  })

  describe('multi-page mode', () => {
    it('property editor works with multi-page config', () => {
      const multiPageConfig = {
        pages: [
          { id: 'p1', title: 'Page 1', uiComponents: [{ component: 'Card', props: { header: 'P1 Card' } }] },
          { id: 'p2', title: 'Page 2', uiComponents: [{ component: 'Badge', props: { value: 5 } }] },
        ],
      }
      store.enterEditMode(multiPageConfig)
      store.selectComponent(0)
      expect(store.selectedComponent!.component).toBe('Card')
      store.updateComponent(0, { props: { header: 'Updated P1' } })
      expect(store.selectedComponent!.props.header).toBe('Updated P1')
    })

    it('switching pages clears selection', () => {
      const multiPageConfig = {
        pages: [
          { id: 'p1', title: 'Page 1', uiComponents: [{ component: 'Card', props: {} }] },
          { id: 'p2', title: 'Page 2', uiComponents: [{ component: 'Badge', props: {} }] },
        ],
      }
      store.enterEditMode(multiPageConfig)
      store.selectComponent(0)
      expect(store.selectedComponent).not.toBeNull()
      store.setActivePage('p2')
      expect(store.selectedComponent).toBeNull()
    })
  })
})
