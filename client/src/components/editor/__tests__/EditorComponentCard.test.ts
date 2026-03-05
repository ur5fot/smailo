import { describe, it, expect } from 'vitest'
import type { UiComponent } from '../../../stores/editor'

// Test the logic used by EditorComponentCard (icon mapping, label extraction, data info)
// These mirror the computed properties in the component

const COMPONENT_ICONS: Record<string, string> = {
  Card: 'pi pi-id-card',
  DataTable: 'pi pi-table',
  Chart: 'pi pi-chart-bar',
  Timeline: 'pi pi-clock',
  Knob: 'pi pi-circle',
  Tag: 'pi pi-tag',
  ProgressBar: 'pi pi-percentage',
  Calendar: 'pi pi-calendar',
  Button: 'pi pi-bolt',
  InputText: 'pi pi-pencil',
  Form: 'pi pi-file-edit',
  Accordion: 'pi pi-list',
  Panel: 'pi pi-window-maximize',
  Chip: 'pi pi-tag',
  Badge: 'pi pi-bell',
  Slider: 'pi pi-sliders-h',
  Rating: 'pi pi-star',
  Tabs: 'pi pi-folder',
  Image: 'pi pi-image',
  MeterGroup: 'pi pi-chart-line',
  CardList: 'pi pi-th-large',
  ConditionalGroup: 'pi pi-filter',
}

function getIconClass(component: string): string {
  return COMPONENT_ICONS[component] || 'pi pi-box'
}

function getLabel(comp: UiComponent): string {
  const p = comp.props
  if (p?.header) return String(p.header)
  if (p?.label) return String(p.label)
  if (p?.title) return String(p.title)
  return ''
}

function getDataInfo(comp: UiComponent): string {
  if (comp.dataSource) {
    return `table:${comp.dataSource.tableId}`
  }
  if (comp.computedValue) {
    return comp.computedValue.length > 30
      ? comp.computedValue.slice(0, 30) + '...'
      : comp.computedValue
  }
  if (comp.dataKey) {
    return comp.dataKey
  }
  return ''
}

function makeComponent(overrides: Partial<UiComponent> = {}): UiComponent {
  return { component: 'Card', props: {}, ...overrides }
}

describe('EditorComponentCard logic', () => {
  describe('icon mapping', () => {
    it('returns correct icon for known components', () => {
      expect(getIconClass('Card')).toBe('pi pi-id-card')
      expect(getIconClass('Button')).toBe('pi pi-bolt')
      expect(getIconClass('DataTable')).toBe('pi pi-table')
      expect(getIconClass('Chart')).toBe('pi pi-chart-bar')
      expect(getIconClass('Form')).toBe('pi pi-file-edit')
      expect(getIconClass('ConditionalGroup')).toBe('pi pi-filter')
    })

    it('returns default icon for unknown component', () => {
      expect(getIconClass('Unknown')).toBe('pi pi-box')
      expect(getIconClass('')).toBe('pi pi-box')
    })

    it('has icons for all 22 components', () => {
      const expected = [
        'Card', 'DataTable', 'Chart', 'Timeline', 'Knob', 'Tag', 'ProgressBar',
        'Calendar', 'Button', 'InputText', 'Form', 'Accordion', 'Panel', 'Chip',
        'Badge', 'Slider', 'Rating', 'Tabs', 'Image', 'MeterGroup', 'CardList',
        'ConditionalGroup',
      ]
      for (const name of expected) {
        expect(COMPONENT_ICONS[name], `missing icon for ${name}`).toBeDefined()
      }
    })
  })

  describe('label extraction', () => {
    it('extracts header from props', () => {
      expect(getLabel(makeComponent({ props: { header: 'My Card' } }))).toBe('My Card')
    })

    it('extracts label from props', () => {
      expect(getLabel(makeComponent({ props: { label: 'Click me' } }))).toBe('Click me')
    })

    it('extracts title from props', () => {
      expect(getLabel(makeComponent({ props: { title: 'Panel Title' } }))).toBe('Panel Title')
    })

    it('prefers header over label and title', () => {
      expect(getLabel(makeComponent({ props: { header: 'H', label: 'L', title: 'T' } }))).toBe('H')
    })

    it('returns empty string when no label-like prop', () => {
      expect(getLabel(makeComponent({ props: { severity: 'info' } }))).toBe('')
    })

    it('returns empty string when props is empty', () => {
      expect(getLabel(makeComponent())).toBe('')
    })
  })

  describe('data info extraction', () => {
    it('shows table info for dataSource', () => {
      expect(getDataInfo(makeComponent({ dataSource: { type: 'table', tableId: 5 } }))).toBe('table:5')
    })

    it('shows computedValue', () => {
      expect(getDataInfo(makeComponent({ computedValue: '= SUM(a)' }))).toBe('= SUM(a)')
    })

    it('truncates long computedValue', () => {
      const long = '= SUM(very_long_table.very_long_column_name)'
      const info = getDataInfo(makeComponent({ computedValue: long }))
      expect(info.length).toBeLessThanOrEqual(33) // 30 + '...'
      expect(info).toContain('...')
    })

    it('shows dataKey', () => {
      expect(getDataInfo(makeComponent({ dataKey: 'temperature' }))).toBe('temperature')
    })

    it('prioritizes dataSource over computedValue and dataKey', () => {
      const comp = makeComponent({
        dataSource: { type: 'table', tableId: 1 },
        computedValue: '= X',
        dataKey: 'key',
      })
      expect(getDataInfo(comp)).toBe('table:1')
    })

    it('prioritizes computedValue over dataKey', () => {
      const comp = makeComponent({ computedValue: '= X', dataKey: 'key' })
      expect(getDataInfo(comp)).toBe('= X')
    })

    it('returns empty string when no data binding', () => {
      expect(getDataInfo(makeComponent())).toBe('')
    })
  })
})
