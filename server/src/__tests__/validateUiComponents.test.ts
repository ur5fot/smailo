import { describe, it, expect } from 'vitest'
import { validateUiComponents } from '../services/aiService.js'

describe('validateUiComponents', () => {
  const baseCard = { component: 'Card', props: { title: 'Test' }, dataKey: 'test' }

  describe('dataSource validation', () => {
    it('preserves valid dataSource with type table and positive integer tableId', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 1 })
    })

    it('preserves valid dataSource with large tableId', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 999 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 999 })
    })

    it('drops dataSource when type is not "table"', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'unknown', tableId: 1 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when tableId is zero', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 0 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when tableId is negative', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: -1 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when tableId is a float', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1.5 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when tableId is a string', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: '1' } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when tableId is missing', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table' } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when it is an array', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: [{ type: 'table', tableId: 1 }] },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when it is a string', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: 'table:1' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('drops dataSource when it is null', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: null },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('keeps component when dataSource is missing (undefined)', () => {
      const result = validateUiComponents([baseCard])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toBeUndefined()
    })

    it('preserves dataSource alongside dataKey (both can coexist)', () => {
      const result = validateUiComponents([
        { ...baseCard, dataKey: 'fallback', dataSource: { type: 'table', tableId: 5 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataKey).toBe('fallback')
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 5 })
    })

    it('works with DataTable component', () => {
      const result = validateUiComponents([
        {
          component: 'DataTable',
          props: { columns: [{ field: 'name', header: 'Name' }] },
          dataSource: { type: 'table', tableId: 3 },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 3 })
    })

    it('works with Form component (dataSource + fields/outputKey)', () => {
      const result = validateUiComponents([
        {
          component: 'Form',
          props: { submitLabel: 'Save' },
          fields: [{ name: 'task', type: 'text', label: 'Task' }],
          outputKey: 'tasks',
          dataSource: { type: 'table', tableId: 2 },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 2 })
    })

    it('accepts Form with dataSource but without outputKey and fields', () => {
      const result = validateUiComponents([
        {
          component: 'Form',
          props: { submitLabel: 'Добавить' },
          dataSource: { type: 'table', tableId: 1 },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 1 })
      expect(result[0].component).toBe('Form')
    })

    it('rejects Form without dataSource and without outputKey/fields', () => {
      const result = validateUiComponents([
        {
          component: 'Form',
          props: { submitLabel: 'Save' },
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('works with Chart component', () => {
      const result = validateUiComponents([
        {
          component: 'Chart',
          props: { type: 'bar' },
          dataSource: { type: 'table', tableId: 4 },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 4 })
    })

    it('works with CardList component', () => {
      const result = validateUiComponents([
        {
          component: 'CardList',
          props: {},
          dataSource: { type: 'table', tableId: 1 },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 1 })
    })
  })

  describe('showIf validation', () => {
    it('preserves valid showIf expression', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: 'count > 0' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBe('count > 0')
    })

    it('trims whitespace from showIf expression', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: '  count > 0  ' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBe('count > 0')
    })

    it('drops invalid showIf expression (unparseable)', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: '>>> invalid <<<' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBeUndefined()
    })

    it('drops empty showIf string', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: '' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBeUndefined()
    })

    it('drops whitespace-only showIf string', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: '   ' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBeUndefined()
    })

    it('drops non-string showIf (number)', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: 42 },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBeUndefined()
    })

    it('drops non-string showIf (null)', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: null },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBeUndefined()
    })

    it('preserves complex showIf expression with function call', () => {
      const result = validateUiComponents([
        { ...baseCard, showIf: 'LEN(name) > 0' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBe('LEN(name) > 0')
    })

    it('component without showIf has showIf undefined', () => {
      const result = validateUiComponents([baseCard])
      expect(result).toHaveLength(1)
      expect(result[0].showIf).toBeUndefined()
    })
  })

  describe('styleIf validation', () => {
    it('preserves valid styleIf array', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: 'count > 10', class: 'warning' },
            { condition: 'count > 100', class: 'critical' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toEqual([
        { condition: 'count > 10', class: 'warning' },
        { condition: 'count > 100', class: 'critical' },
      ])
    })

    it('filters out entries with invalid condition', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: 'count > 10', class: 'warning' },
            { condition: '>>> bad <<<', class: 'critical' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toEqual([
        { condition: 'count > 10', class: 'warning' },
      ])
    })

    it('filters out entries with empty class', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: 'count > 0', class: '' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toBeUndefined()
    })

    it('filters out entries with invalid class characters', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: 'count > 0', class: 'has spaces' },
            { condition: 'count > 0', class: 'valid-class' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toEqual([
        { condition: 'count > 0', class: 'valid-class' },
      ])
    })

    it('accepts class names with underscores and dashes', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: 'x > 0', class: 'my_class-name' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toEqual([
        { condition: 'x > 0', class: 'my_class-name' },
      ])
    })

    it('drops styleIf when all entries are invalid', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: '>>> bad <<<', class: 'warning' },
            { condition: 'ok > 0', class: '' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toBeUndefined()
    })

    it('drops styleIf when it is not an array', () => {
      const result = validateUiComponents([
        { ...baseCard, styleIf: 'not-an-array' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toBeUndefined()
    })

    it('drops styleIf when it is null', () => {
      const result = validateUiComponents([
        { ...baseCard, styleIf: null },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toBeUndefined()
    })

    it('filters out entries missing condition or class keys', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: 'x > 0' },
            { class: 'warning' },
            { condition: 'x > 0', class: 'success' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toEqual([
        { condition: 'x > 0', class: 'success' },
      ])
    })

    it('trims condition and class whitespace', () => {
      const result = validateUiComponents([
        {
          ...baseCard,
          styleIf: [
            { condition: '  x > 0  ', class: '  warning  ' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toEqual([
        { condition: 'x > 0', class: 'warning' },
      ])
    })

    it('component without styleIf has styleIf undefined', () => {
      const result = validateUiComponents([baseCard])
      expect(result).toHaveLength(1)
      expect(result[0].styleIf).toBeUndefined()
    })
  })

  describe('existing validation still works', () => {
    it('rejects components with invalid component name', () => {
      const result = validateUiComponents([
        { component: 'InvalidComponent', props: {} },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects components with non-object props', () => {
      const result = validateUiComponents([
        { component: 'Card', props: 'invalid' },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects Button without action', () => {
      const result = validateUiComponents([
        { component: 'Button', props: { label: 'Click' } },
      ])
      expect(result).toHaveLength(0)
    })

    it('accepts Button with valid action', () => {
      const result = validateUiComponents([
        { component: 'Button', props: { label: 'Click' }, action: { key: 'click', value: 1 } },
      ])
      expect(result).toHaveLength(1)
    })

    it('truncates to 20 items', () => {
      const items = Array.from({ length: 25 }, (_, i) => ({
        component: 'Card',
        props: { title: `Card ${i}` },
      }))
      const result = validateUiComponents(items)
      expect(result).toHaveLength(20)
    })
  })
})
