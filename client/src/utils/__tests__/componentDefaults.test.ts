import { describe, it, expect } from 'vitest'
import { getDefaultComponent, COMPONENT_CATEGORIES } from '../componentDefaults'

describe('COMPONENT_CATEGORIES', () => {
  it('has three categories: Display, Input, Layout', () => {
    expect(COMPONENT_CATEGORIES.map(c => c.label)).toEqual(['Display', 'Input', 'Layout'])
  })

  it('Display category has 15 components', () => {
    const display = COMPONENT_CATEGORIES.find(c => c.label === 'Display')!
    expect(display.components).toHaveLength(15)
  })

  it('Input category has 3 components', () => {
    const input = COMPONENT_CATEGORIES.find(c => c.label === 'Input')!
    expect(input.components).toHaveLength(3)
  })

  it('Layout category has 4 components', () => {
    const layout = COMPONENT_CATEGORIES.find(c => c.label === 'Layout')!
    expect(layout.components).toHaveLength(4)
  })

  it('all components have type, icon, and label', () => {
    for (const cat of COMPONENT_CATEGORIES) {
      for (const comp of cat.components) {
        expect(comp.type).toBeTruthy()
        expect(comp.icon).toMatch(/^pi /)
        expect(comp.label).toBeTruthy()
      }
    }
  })
})

describe('getDefaultComponent', () => {
  it('returns a Card with title prop and colSpan 6', () => {
    const card = getDefaultComponent('Card')
    expect(card.component).toBe('Card')
    expect(card.props.title).toBe('New Card')
    expect(card.layout).toEqual({ col: 1, colSpan: 6 })
  })

  it('returns a DataTable with full-width layout', () => {
    const table = getDefaultComponent('DataTable')
    expect(table.component).toBe('DataTable')
    expect(table.layout).toEqual({ col: 1, colSpan: 12 })
  })

  it('returns a Button with actions and colSpan 3', () => {
    const btn = getDefaultComponent('Button')
    expect(btn.component).toBe('Button')
    expect(btn.props.label).toBe('Button')
    expect(btn.actions).toHaveLength(1)
    expect((btn.actions![0] as any).type).toBe('writeData')
    expect(btn.layout?.colSpan).toBe(3)
  })

  it('returns an InputText with actions and colSpan 6', () => {
    const input = getDefaultComponent('InputText')
    expect(input.component).toBe('InputText')
    expect(input.props.placeholder).toBeTruthy()
    expect(input.actions).toHaveLength(1)
    expect(input.layout?.colSpan).toBe(6)
  })

  it('returns a Form with fields, outputKey, and colSpan 6', () => {
    const form = getDefaultComponent('Form')
    expect(form.component).toBe('Form')
    expect(form.fields).toHaveLength(1)
    expect(form.outputKey).toBe('form_data')
    expect(form.layout?.colSpan).toBe(6)
  })

  it('returns a Chart with type prop', () => {
    const chart = getDefaultComponent('Chart')
    expect(chart.component).toBe('Chart')
    expect(chart.props.type).toBe('bar')
    expect(chart.layout?.colSpan).toBe(12)
  })

  it('returns a ConditionalGroup with condition and children', () => {
    const cg = getDefaultComponent('ConditionalGroup')
    expect(cg.component).toBe('ConditionalGroup')
    expect(cg.condition).toBe('true')
    expect(cg.children).toEqual([{ component: 'Card', props: { title: 'Content' } }])
  })

  it('returns a Badge with colSpan 2', () => {
    const badge = getDefaultComponent('Badge')
    expect(badge.component).toBe('Badge')
    expect(badge.props.value).toBe('0')
    expect(badge.layout?.colSpan).toBe(2)
  })

  it('returns an Accordion with tabs prop', () => {
    const acc = getDefaultComponent('Accordion')
    expect(acc.component).toBe('Accordion')
    expect(acc.props.tabs).toHaveLength(1)
  })

  it('returns a Panel with header and toggleable props', () => {
    const panel = getDefaultComponent('Panel')
    expect(panel.component).toBe('Panel')
    expect(panel.props.header).toBe('Panel')
    expect(panel.props.toggleable).toBe(true)
  })

  it('returns fallback for unknown type', () => {
    const unknown = getDefaultComponent('UnknownWidget')
    expect(unknown.component).toBe('UnknownWidget')
    expect(unknown.layout).toEqual({ col: 1, colSpan: 12 })
  })

  it('all known component types return valid defaults', () => {
    const allTypes = COMPONENT_CATEGORIES.flatMap(c => c.components.map(comp => comp.type))
    for (const type of allTypes) {
      const comp = getDefaultComponent(type)
      expect(comp.component).toBe(type)
      expect(comp.layout).toBeDefined()
      expect(comp.layout!.col).toBeGreaterThanOrEqual(1)
      expect(comp.layout!.colSpan).toBeGreaterThanOrEqual(1)
      expect(comp.layout!.col + comp.layout!.colSpan).toBeLessThanOrEqual(13)
    }
  })
})
