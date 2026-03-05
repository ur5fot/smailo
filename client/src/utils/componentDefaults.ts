import type { UiComponent } from '../stores/editor'

export interface ComponentCategory {
  label: string
  components: ComponentInfo[]
}

export interface ComponentInfo {
  type: string
  icon: string
  label: string
}

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

export const COMPONENT_CATEGORIES: ComponentCategory[] = [
  {
    label: 'Display',
    components: [
      { type: 'Card', icon: COMPONENT_ICONS.Card, label: 'Card' },
      { type: 'DataTable', icon: COMPONENT_ICONS.DataTable, label: 'DataTable' },
      { type: 'Chart', icon: COMPONENT_ICONS.Chart, label: 'Chart' },
      { type: 'Timeline', icon: COMPONENT_ICONS.Timeline, label: 'Timeline' },
      { type: 'Knob', icon: COMPONENT_ICONS.Knob, label: 'Knob' },
      { type: 'Tag', icon: COMPONENT_ICONS.Tag, label: 'Tag' },
      { type: 'ProgressBar', icon: COMPONENT_ICONS.ProgressBar, label: 'ProgressBar' },
      { type: 'Calendar', icon: COMPONENT_ICONS.Calendar, label: 'Calendar' },
      { type: 'CardList', icon: COMPONENT_ICONS.CardList, label: 'CardList' },
      { type: 'Image', icon: COMPONENT_ICONS.Image, label: 'Image' },
      { type: 'MeterGroup', icon: COMPONENT_ICONS.MeterGroup, label: 'MeterGroup' },
      { type: 'Badge', icon: COMPONENT_ICONS.Badge, label: 'Badge' },
      { type: 'Chip', icon: COMPONENT_ICONS.Chip, label: 'Chip' },
      { type: 'Slider', icon: COMPONENT_ICONS.Slider, label: 'Slider' },
      { type: 'Rating', icon: COMPONENT_ICONS.Rating, label: 'Rating' },
    ],
  },
  {
    label: 'Input',
    components: [
      { type: 'Button', icon: COMPONENT_ICONS.Button, label: 'Button' },
      { type: 'InputText', icon: COMPONENT_ICONS.InputText, label: 'InputText' },
      { type: 'Form', icon: COMPONENT_ICONS.Form, label: 'Form' },
    ],
  },
  {
    label: 'Layout',
    components: [
      { type: 'Accordion', icon: COMPONENT_ICONS.Accordion, label: 'Accordion' },
      { type: 'Panel', icon: COMPONENT_ICONS.Panel, label: 'Panel' },
      { type: 'Tabs', icon: COMPONENT_ICONS.Tabs, label: 'Tabs' },
      { type: 'ConditionalGroup', icon: COMPONENT_ICONS.ConditionalGroup, label: 'ConditionalGroup' },
    ],
  },
]

export function getDefaultComponent(type: string): UiComponent {
  const base: UiComponent = {
    component: type,
    props: {},
    layout: { col: 1, colSpan: 12 },
  }

  switch (type) {
    case 'Card':
      return { ...base, props: { header: 'New Card' }, layout: { col: 1, colSpan: 6 } }

    case 'DataTable':
      return { ...base, props: {} }

    case 'Chart':
      return { ...base, props: { type: 'bar' } }

    case 'Timeline':
      return { ...base, props: {} }

    case 'Knob':
      return { ...base, props: { min: 0, max: 100 }, layout: { col: 1, colSpan: 3 } }

    case 'Tag':
      return { ...base, props: { value: 'Tag', severity: 'info' }, layout: { col: 1, colSpan: 3 } }

    case 'ProgressBar':
      return { ...base, props: { value: 50 }, layout: { col: 1, colSpan: 6 } }

    case 'Calendar':
      return { ...base, props: {} }

    case 'CardList':
      return { ...base, props: {} }

    case 'Image':
      return { ...base, props: { alt: 'Image' }, layout: { col: 1, colSpan: 6 } }

    case 'MeterGroup':
      return { ...base, props: {} }

    case 'Badge':
      return { ...base, props: { value: '0', severity: 'info' }, layout: { col: 1, colSpan: 2 } }

    case 'Chip':
      return { ...base, props: { label: 'Chip' }, layout: { col: 1, colSpan: 3 } }

    case 'Slider':
      return { ...base, props: { min: 0, max: 100 }, layout: { col: 1, colSpan: 6 } }

    case 'Rating':
      return { ...base, props: { stars: 5 }, layout: { col: 1, colSpan: 4 } }

    case 'Button':
      return {
        ...base,
        props: { label: 'Button' },
        actions: [{ type: 'writeData', key: 'click_count', value: 0, mode: 'increment' }],
        layout: { col: 1, colSpan: 3 },
      }

    case 'InputText':
      return {
        ...base,
        props: { placeholder: 'Enter text...' },
        actions: [{ type: 'writeData', key: 'input_value' }],
        layout: { col: 1, colSpan: 6 },
      }

    case 'Form':
      return {
        ...base,
        props: { submitLabel: 'Submit' },
        fields: [{ name: 'field1', type: 'text', label: 'Field 1' }],
        outputKey: 'form_data',
        layout: { col: 1, colSpan: 6 },
      }

    case 'Accordion':
      return { ...base, props: { tabs: [{ header: 'Section 1', dataKey: '' }] } }

    case 'Panel':
      return { ...base, props: { header: 'Panel', toggleable: true } }

    case 'Tabs':
      return { ...base, props: { tabs: [{ header: 'Tab 1', dataKey: '' }] } }

    case 'ConditionalGroup':
      return { ...base, condition: 'true', children: [] }

    default:
      return base
  }
}
