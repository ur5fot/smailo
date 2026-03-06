import { describe, it, expect } from 'vitest'
import { resolveDataKey } from '../../utils/dataKey'
import { gridItemStyle } from '../../utils/gridLayout'
import { evaluateShowIf } from '../../utils/showIf'
import { getConditionalClasses } from '../../utils/conditionalClasses'
import { buildFormulaContext } from '../../utils/formulaContext'

/**
 * AppRenderer logic tests — tests the core rendering logic without mounting the Vue component.
 *
 * We test:
 * 1. Component rendering decisions (which template branch each component type takes)
 * 2. resolvedProps logic (prop filtering, data binding priority, special component handling)
 * 3. shouldShow logic (showIf + ConditionalGroup condition)
 * 4. CSS Grid layout via gridItemStyle
 * 5. Conditional CSS classes via getConditionalClasses
 * 6. dataKey resolution (simple, dot notation, JSON auto-parse)
 */

// --- Helper: mirrors AppRenderer's isSafeProp + resolvedProps logic ---
function isSafeProp(key: string): boolean {
  return !key.toLowerCase().startsWith('on')
}

interface UiConfigItem {
  component: string
  props: Record<string, any>
  dataKey?: string
  dataSource?: { type: 'table'; tableId: number }
  computedValue?: string
  layout?: { col: number; colSpan: number; row?: number; rowSpan?: number }
  showIf?: string
  styleIf?: Array<{ condition: string; class: string }>
  condition?: string
  children?: UiConfigItem[]
  action?: { key: string; value?: unknown }
  actions?: any[]
  fields?: Array<{ name: string; type: string; label: string }>
  outputKey?: string
}

function resolvedProps(
  item: UiConfigItem,
  index: number,
  appData: Record<string, any>,
  computedValues?: Record<number, unknown>,
  storeComputedValues: Record<number, unknown> = {}
): Record<string, any> {
  const safeProps = Object.fromEntries(
    Object.entries(item.props ?? {}).filter(([key]) => isSafeProp(key))
  )
  const resolved = { ...safeProps }

  let data: unknown
  if (item.dataSource) {
    // dataSource takes priority — data fetching handled by wrapper components
  } else if (item.computedValue) {
    const cvMap = computedValues ?? storeComputedValues
    if (index in cvMap) data = cvMap[index]
  } else if (item.dataKey !== undefined) {
    data = resolveDataKey(appData, item.dataKey)
  }

  if (data !== undefined) {
    if (item.component === 'Chart') {
      resolved.data = data
    } else if (item.component === 'Image') {
      resolved.src = data
    } else if (item.component === 'Chip') {
      resolved.label = data
    } else {
      resolved.value = data
    }
  }

  if (item.component === 'Slider') {
    resolved.disabled = true
  } else if (item.component === 'Rating') {
    resolved.readonly = true
  }
  return resolved
}

function shouldShow(item: UiConfigItem, formulaContext: Record<string, unknown>): boolean {
  if (item.component === 'ConditionalGroup' && item.condition) {
    return evaluateShowIf(item.condition, formulaContext)
  }
  if (!item.showIf) return true
  return evaluateShowIf(item.showIf, formulaContext)
}

// --- Tests ---

describe('AppRenderer — rendering decisions', () => {
  it('Button requires actions or action to render as AppButton', () => {
    const withActions: UiConfigItem = { component: 'Button', props: { label: 'Go' }, actions: [{ type: 'writeData', key: 'x', value: 1 }] }
    const withAction: UiConfigItem = { component: 'Button', props: { label: 'Go' }, action: { key: 'x', value: 1 } }
    const withoutActions: UiConfigItem = { component: 'Button', props: { label: 'Go' } }

    expect(!!(withActions.actions || withActions.action)).toBe(true)
    expect(!!(withAction.actions || withAction.action)).toBe(true)
    expect(!!(withoutActions.actions || withoutActions.action)).toBe(false)
  })

  it('InputText requires actions or action to render as AppInputText', () => {
    const item: UiConfigItem = { component: 'InputText', props: {}, actions: [{ type: 'writeData', key: 'x' }] }
    expect(item.component === 'InputText' && !!(item.actions || item.action)).toBe(true)
  })

  it('Form requires dataSource or (fields + outputKey) to render', () => {
    const withDataSource: UiConfigItem = { component: 'Form', props: {}, dataSource: { type: 'table', tableId: 1 } }
    const withFields: UiConfigItem = {
      component: 'Form', props: {},
      fields: [{ name: 'name', type: 'text', label: 'Name' }],
      outputKey: 'entries'
    }
    const incomplete: UiConfigItem = { component: 'Form', props: {}, fields: [{ name: 'n', type: 'text', label: 'N' }] }

    expect(!!(withDataSource.dataSource || (withDataSource.fields && withDataSource.outputKey))).toBe(true)
    expect(!!(withFields.dataSource || (withFields.fields && withFields.outputKey))).toBe(true)
    expect(!!(incomplete.dataSource || (incomplete.fields && incomplete.outputKey))).toBe(false)
  })

  it('ConditionalGroup requires condition and children', () => {
    const valid: UiConfigItem = {
      component: 'ConditionalGroup', props: {},
      condition: 'active == 1',
      children: [{ component: 'Card', props: {} }]
    }
    const noCondition: UiConfigItem = { component: 'ConditionalGroup', props: {}, children: [{ component: 'Card', props: {} }] }
    const noChildren: UiConfigItem = { component: 'ConditionalGroup', props: {}, condition: 'active == 1' }

    expect(!!(valid.condition && valid.children)).toBe(true)
    expect(!!(noCondition.condition && noCondition.children)).toBe(false)
    expect(!!(noChildren.condition && noChildren.children)).toBe(false)
  })

})

describe('AppRenderer — resolvedProps', () => {
  describe('on* prop stripping', () => {
    it('strips props starting with "on" (case-insensitive)', () => {
      const item: UiConfigItem = {
        component: 'Card',
        props: { header: 'Title', onClick: 'alert(1)', onMouseOver: 'xss()', label: 'OK' }
      }
      const result = resolvedProps(item, 0, {})
      expect(result.header).toBe('Title')
      expect(result.label).toBe('OK')
      expect(result.onClick).toBeUndefined()
      expect(result.onMouseOver).toBeUndefined()
    })

    it('strips onload and similar mixed-case event handlers', () => {
      const item: UiConfigItem = {
        component: 'Tag',
        props: { severity: 'info', ONload: 'evil()' }
      }
      const result = resolvedProps(item, 0, {})
      expect(result.severity).toBe('info')
      expect(result.ONload).toBeUndefined()
    })

    it('keeps props that happen to contain "on" but do not start with it', () => {
      const item: UiConfigItem = {
        component: 'Card',
        props: { condition: 'true', icon: 'pi pi-home' }
      }
      const result = resolvedProps(item, 0, {})
      expect(result.condition).toBe('true')
      expect(result.icon).toBe('pi pi-home')
    })
  })

  describe('data binding — dataKey', () => {
    it('binds simple dataKey to value prop', () => {
      const item: UiConfigItem = { component: 'Card', props: {}, dataKey: 'score' }
      const result = resolvedProps(item, 0, { score: 42 })
      expect(result.value).toBe(42)
    })

    it('binds dot notation dataKey for nested access', () => {
      const item: UiConfigItem = { component: 'Card', props: {}, dataKey: 'rates.USD' }
      const result = resolvedProps(item, 0, { rates: JSON.stringify({ USD: 90.5 }) })
      expect(result.value).toBe(90.5)
    })

    it('returns undefined for missing dataKey', () => {
      const item: UiConfigItem = { component: 'Card', props: {}, dataKey: 'missing' }
      const result = resolvedProps(item, 0, {})
      expect(result.value).toBeUndefined()
    })
  })

  describe('data binding — Image binds to src', () => {
    it('binds dataKey to src prop for Image component', () => {
      const item: UiConfigItem = { component: 'Image', props: {}, dataKey: 'photo' }
      const result = resolvedProps(item, 0, { photo: 'https://example.com/pic.jpg' })
      expect(result.src).toBe('https://example.com/pic.jpg')
      expect(result.value).toBeUndefined()
    })
  })

  describe('data binding — Chip binds to label', () => {
    it('binds dataKey to label prop for Chip component', () => {
      const item: UiConfigItem = { component: 'Chip', props: {}, dataKey: 'tag' }
      const result = resolvedProps(item, 0, { tag: 'Featured' })
      expect(result.label).toBe('Featured')
      expect(result.value).toBeUndefined()
    })
  })

  describe('data binding — Chart binds to data', () => {
    it('binds dataKey to data prop for Chart component', () => {
      const chartData = { labels: ['Jan'], datasets: [{ data: [10] }] }
      const item: UiConfigItem = { component: 'Chart', props: {}, dataKey: 'chartData' }
      const result = resolvedProps(item, 0, { chartData })
      expect(result.data).toEqual(chartData)
      expect(result.value).toBeUndefined()
    })
  })

  describe('data binding priority: dataSource > computedValue > dataKey', () => {
    it('dataSource takes priority — no data prop set by resolvedProps', () => {
      const item: UiConfigItem = {
        component: 'Card', props: {},
        dataSource: { type: 'table', tableId: 1 },
        computedValue: '= SUM(expenses.amount)',
        dataKey: 'fallback'
      }
      const result = resolvedProps(item, 0, { fallback: 'no' }, { 0: 999 })
      // When dataSource is present, neither computedValue nor dataKey should set value
      expect(result.value).toBeUndefined()
    })

    it('computedValue takes priority over dataKey', () => {
      const item: UiConfigItem = {
        component: 'Card', props: {},
        computedValue: '= SUM(expenses.amount)',
        dataKey: 'fallback'
      }
      const result = resolvedProps(item, 0, { fallback: 'no' }, { 0: 42 })
      expect(result.value).toBe(42)
    })

    it('computedValue not in computedValues map — value stays undefined', () => {
      const item: UiConfigItem = {
        component: 'Card', props: {},
        computedValue: '= SUM(expenses.amount)',
        dataKey: 'fallback'
      }
      // Index 0 not in computedValues, so computedValue branch runs but data stays undefined
      const result = resolvedProps(item, 0, { fallback: 'test' }, {})
      expect(result.value).toBeUndefined()
    })

    it('computedValue falls back to store values when prop is undefined', () => {
      const item: UiConfigItem = {
        component: 'Card', props: {},
        computedValue: '= SUM(expenses.amount)'
      }
      // props.computedValues is undefined, storeComputedValues has the value
      const result = resolvedProps(item, 0, {}, undefined, { 0: 100 })
      expect(result.value).toBe(100)
    })

    it('computedValue prefers prop over store values', () => {
      const item: UiConfigItem = {
        component: 'Card', props: {},
        computedValue: '= SUM(expenses.amount)'
      }
      // Both prop and store have values — prop wins
      const result = resolvedProps(item, 0, {}, { 0: 42 }, { 0: 100 })
      expect(result.value).toBe(42)
    })

    it('dataKey used when no dataSource or computedValue', () => {
      const item: UiConfigItem = { component: 'Card', props: {}, dataKey: 'count' }
      const result = resolvedProps(item, 0, { count: 7 })
      expect(result.value).toBe(7)
    })
  })

  describe('read-only enforcement', () => {
    it('Slider is forced disabled', () => {
      const item: UiConfigItem = { component: 'Slider', props: { min: 0, max: 100 }, dataKey: 'progress' }
      const result = resolvedProps(item, 0, { progress: 50 })
      expect(result.disabled).toBe(true)
      expect(result.value).toBe(50)
    })

    it('Rating is forced readonly', () => {
      const item: UiConfigItem = { component: 'Rating', props: {}, dataKey: 'stars' }
      const result = resolvedProps(item, 0, { stars: 4 })
      expect(result.readonly).toBe(true)
      expect(result.value).toBe(4)
    })

    it('other components do not get disabled/readonly forced', () => {
      const item: UiConfigItem = { component: 'Card', props: {}, dataKey: 'v' }
      const result = resolvedProps(item, 0, { v: 1 })
      expect(result.disabled).toBeUndefined()
      expect(result.readonly).toBeUndefined()
    })
  })

  describe('empty / missing props', () => {
    it('handles item with no props object gracefully', () => {
      const item: UiConfigItem = { component: 'Tag', props: undefined as any }
      const result = resolvedProps(item, 0, {})
      expect(result).toEqual({})
    })
  })
})

describe('AppRenderer — shouldShow (showIf + ConditionalGroup)', () => {
  it('returns true when no showIf is defined', () => {
    const item: UiConfigItem = { component: 'Card', props: {} }
    expect(shouldShow(item, {})).toBe(true)
  })

  it('returns true when showIf evaluates to truthy', () => {
    const item: UiConfigItem = { component: 'Card', props: {}, showIf: 'active == 1' }
    expect(shouldShow(item, { active: 1 })).toBe(true)
  })

  it('returns false when showIf evaluates to falsy', () => {
    const item: UiConfigItem = { component: 'Card', props: {}, showIf: 'active == 1' }
    expect(shouldShow(item, { active: 0 })).toBe(false)
  })

  it('ConditionalGroup uses condition field instead of showIf', () => {
    const item: UiConfigItem = {
      component: 'ConditionalGroup', props: {},
      condition: 'status == 1',
      children: [{ component: 'Card', props: {} }]
    }
    expect(shouldShow(item, { status: 1 })).toBe(true)
    expect(shouldShow(item, { status: 0 })).toBe(false)
  })

  it('ConditionalGroup without condition is always shown', () => {
    const item: UiConfigItem = {
      component: 'ConditionalGroup', props: {},
      children: [{ component: 'Card', props: {} }]
    }
    // No condition means it doesn't enter the ConditionalGroup branch, and no showIf → true
    expect(shouldShow(item, {})).toBe(true)
  })

  it('invalid showIf expression returns false', () => {
    const item: UiConfigItem = { component: 'Card', props: {}, showIf: '(((' }
    expect(shouldShow(item, {})).toBe(false)
  })
})

describe('AppRenderer — CSS Grid layout (gridItemStyle)', () => {
  it('returns empty style when no layout defined (full-width default via CSS)', () => {
    const style = gridItemStyle(undefined)
    expect(style).toEqual({})
  })

  it('applies col and colSpan as grid-column', () => {
    const style = gridItemStyle({ col: 1, colSpan: 6 })
    expect(style.gridColumn).toBe('1 / span 6')
  })

  it('clamps col to 1-12 range', () => {
    expect(gridItemStyle({ col: 0, colSpan: 4 }).gridColumn).toBe('1 / span 4')
    expect(gridItemStyle({ col: 15, colSpan: 1 }).gridColumn).toBe('12 / span 1')
  })

  it('clamps colSpan so col + colSpan <= 13', () => {
    const style = gridItemStyle({ col: 10, colSpan: 6 })
    // col=10, max colSpan = 13-10 = 3
    expect(style.gridColumn).toBe('10 / span 3')
  })

  it('applies row when provided', () => {
    const style = gridItemStyle({ col: 1, colSpan: 12, row: 2 })
    expect(style.gridRow).toBe('2')
  })

  it('applies row and rowSpan together', () => {
    const style = gridItemStyle({ col: 1, colSpan: 12, row: 3, rowSpan: 2 })
    expect(style.gridRow).toBe('3 / span 2')
  })

  it('row minimum is 1', () => {
    const style = gridItemStyle({ col: 1, colSpan: 12, row: 0 })
    expect(style.gridRow).toBe('1')
  })
})

describe('AppRenderer — conditional CSS classes (getConditionalClasses)', () => {
  it('returns empty array when no styleIf defined', () => {
    expect(getConditionalClasses(undefined, {})).toEqual([])
  })

  it('returns empty array for empty styleIf array', () => {
    expect(getConditionalClasses([], {})).toEqual([])
  })

  it('applies class when condition is truthy', () => {
    const styleIf = [{ condition: 'errors > 0', class: 'critical' }]
    const classes = getConditionalClasses(styleIf, { errors: 5 })
    expect(classes).toContain('si-critical')
  })

  it('does not apply class when condition is falsy', () => {
    const styleIf = [{ condition: 'errors > 0', class: 'critical' }]
    const classes = getConditionalClasses(styleIf, { errors: 0 })
    expect(classes).not.toContain('si-critical')
  })

  it('applies multiple classes when multiple conditions are truthy', () => {
    const styleIf = [
      { condition: 'errors > 0', class: 'critical' },
      { condition: 'warnings > 0', class: 'warning' }
    ]
    const classes = getConditionalClasses(styleIf, { errors: 1, warnings: 3 })
    expect(classes).toContain('si-critical')
    expect(classes).toContain('si-warning')
  })
})
