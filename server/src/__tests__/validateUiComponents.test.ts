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

  describe('ConditionalGroup validation', () => {
    const baseChild = { component: 'Card', props: { title: 'Child' }, dataKey: 'data' }

    it('accepts valid ConditionalGroup with condition and children', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
          children: [baseChild],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].component).toBe('ConditionalGroup')
      expect(result[0].condition).toBe('count > 0')
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children![0].component).toBe('Card')
    })

    it('trims whitespace from condition', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: '  count > 0  ',
          children: [baseChild],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].condition).toBe('count > 0')
    })

    it('rejects ConditionalGroup without condition', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          children: [baseChild],
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects ConditionalGroup with empty condition string', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: '',
          children: [baseChild],
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects ConditionalGroup with whitespace-only condition', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: '   ',
          children: [baseChild],
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects ConditionalGroup with invalid (unparseable) condition', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: '>>> invalid <<<',
          children: [baseChild],
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects ConditionalGroup without children', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects ConditionalGroup with empty children array', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
          children: [],
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects ConditionalGroup with non-array children', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
          children: 'not-an-array',
        },
      ])
      expect(result).toHaveLength(0)
    })

    it('filters out nested ConditionalGroup from children (max 1 level)', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
          children: [
            baseChild,
            {
              component: 'ConditionalGroup',
              props: {},
              condition: 'x > 0',
              children: [baseChild],
            },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      // Nested ConditionalGroup should be filtered out from children
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children![0].component).toBe('Card')
    })

    it('validates children through normal validation (invalid children are filtered out)', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
          children: [
            baseChild,
            { component: 'InvalidComponent', props: {} },
            { component: 'Button', props: { label: 'Click' } }, // Button without action — invalid
          ],
        },
      ])
      expect(result).toHaveLength(1)
      // Only the valid Card child should remain
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children![0].component).toBe('Card')
    })

    it('accepts ConditionalGroup with multiple valid children', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'status == "active"',
          children: [
            { component: 'Card', props: { title: 'First' }, dataKey: 'data1' },
            { component: 'Tag', props: { value: 'Active' } },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].children).toHaveLength(2)
    })

    it('accepts complex condition expression', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'LEN(name) > 0 && count >= 5',
          children: [baseChild],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].condition).toBe('LEN(name) > 0 && count >= 5')
    })

    it('children in ConditionalGroup can have showIf and styleIf', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'active == 1',
          children: [
            {
              component: 'Card',
              props: { title: 'Status' },
              dataKey: 'data',
              showIf: 'x > 0',
              styleIf: [{ condition: 'x > 10', class: 'warning' }],
            },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].children).toHaveLength(1)
      expect(result[0].children![0].showIf).toBe('x > 0')
      expect(result[0].children![0].styleIf).toEqual([{ condition: 'x > 10', class: 'warning' }])
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

  describe('computedValue validation', () => {
    it('strips "= " prefix from valid formula', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Total' }, computedValue: '= SUM(expenses.amount)' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].computedValue).toBe('SUM(expenses.amount)')
    })

    it('strips "=" prefix without space', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Total' }, computedValue: '=COUNT(items)' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].computedValue).toBe('COUNT(items)')
    })

    it('keeps valid formula without prefix', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Total' }, computedValue: 'x + y' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].computedValue).toBe('x + y')
    })

    it('drops invalid (unparseable) formula', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Total' }, computedValue: '= >>> invalid <<<' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].computedValue).toBeUndefined()
    })

    it('drops empty formula string', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Total' }, computedValue: '= ' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].computedValue).toBeUndefined()
    })

    it('drops non-string computedValue', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Total' }, computedValue: 42 },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].computedValue).toBeUndefined()
    })
  })

  describe('dataKey prototype pollution prevention', () => {
    it('rejects component with __proto__ as dataKey', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Test' }, dataKey: '__proto__' },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects component with __proto__ as a segment in dotted dataKey', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Test' }, dataKey: 'a.__proto__.b' },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects component with "constructor" as dataKey', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Test' }, dataKey: 'constructor' },
      ])
      expect(result).toHaveLength(0)
    })

    it('rejects component with "prototype" as dataKey', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Test' }, dataKey: 'prototype' },
      ])
      expect(result).toHaveLength(0)
    })

    it('accepts normal dotted dataKey', () => {
      const result = validateUiComponents([
        { component: 'Card', props: { title: 'Test' }, dataKey: 'rates.USD' },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataKey).toBe('rates.USD')
    })
  })

  describe('ConditionalGroup drops entire group when all children are invalid', () => {
    it('drops ConditionalGroup when the only valid children would all be removed', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
          children: [
            { component: 'InvalidComponent', props: {} },
            { component: 'Button', props: { label: 'Click' } }, // Button without action — invalid
          ],
        },
      ])
      // All children are invalid → group is dropped entirely
      expect(result).toHaveLength(0)
    })

    it('strips computedValue from ConditionalGroup children', () => {
      const result = validateUiComponents([
        {
          component: 'ConditionalGroup',
          props: {},
          condition: 'count > 0',
          children: [
            {
              component: 'Card',
              props: { title: 'Total' },
              computedValue: '= SUM(expenses.amount)',
            },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      // computedValue is not supported inside ConditionalGroup children
      expect(result[0].children![0].computedValue).toBeUndefined()
    })
  })
})
