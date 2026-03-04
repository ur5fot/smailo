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

  describe('dataSource filter validation', () => {
    it('preserves valid single filter with column and value (operator defaults to eq)', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1, filter: { column: 'priority', value: 'high' } } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 1, filter: { column: 'priority', value: 'high' } })
    })

    it('preserves valid single filter with explicit operator', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 2, filter: { column: 'amount', operator: 'gt', value: 100 } } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 2, filter: { column: 'amount', operator: 'gt', value: 100 } })
    })

    it('preserves valid array filter (AND logic)', () => {
      const filter = [
        { column: 'status', value: 'active' },
        { column: 'score', operator: 'gte', value: 80 },
      ]
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 3, filter } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 3, filter })
    })

    it('drops filter when operator is unknown', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1, filter: { column: 'x', operator: 'like', value: 'foo' } } },
      ])
      expect(result).toHaveLength(1)
      expect((result[0].dataSource as Record<string, unknown>).filter).toBeUndefined()
    })

    it('drops filter when column is missing', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1, filter: { value: 'foo' } } },
      ])
      expect(result).toHaveLength(1)
      expect((result[0].dataSource as Record<string, unknown>).filter).toBeUndefined()
    })

    it('drops filter when value is an object', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1, filter: { column: 'x', value: { nested: true } } } },
      ])
      expect(result).toHaveLength(1)
      expect((result[0].dataSource as Record<string, unknown>).filter).toBeUndefined()
    })

    it('drops array filter when all conditions are invalid', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1, filter: [{ value: 'no column' }, { column: 'x', value: {} }] } },
      ])
      expect(result).toHaveLength(1)
      expect((result[0].dataSource as Record<string, unknown>).filter).toBeUndefined()
    })

    it('keeps valid conditions in array filter, drops invalid ones', () => {
      const filter = [
        { column: 'status', value: 'active' },         // valid
        { value: 'missing column' },                    // invalid: no column
      ]
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1, filter } },
      ])
      expect(result).toHaveLength(1)
      const ds = result[0].dataSource as Record<string, unknown>
      expect(ds.filter).toEqual([{ column: 'status', value: 'active' }])
    })

    it('strips filter from Form component even if valid', () => {
      const result = validateUiComponents([
        {
          component: 'Form',
          props: { submitLabel: 'Save' },
          dataSource: { type: 'table', tableId: 1, filter: { column: 'status', value: 'active' } },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].component).toBe('Form')
      expect((result[0].dataSource as Record<string, unknown>).filter).toBeUndefined()
    })

    it('backward compat: dataSource without filter still valid', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 5 } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 5 })
    })

    it('preserves boolean value in filter', () => {
      const result = validateUiComponents([
        { ...baseCard, dataSource: { type: 'table', tableId: 1, filter: { column: 'active', value: true } } },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].dataSource).toEqual({ type: 'table', tableId: 1, filter: { column: 'active', value: true } })
    })

    it('preserves all valid operators', () => {
      const operators = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains']
      for (const op of operators) {
        const result = validateUiComponents([
          { ...baseCard, dataSource: { type: 'table', tableId: 1, filter: { column: 'x', operator: op, value: 1 } } },
        ])
        expect(result).toHaveLength(1)
        expect((result[0].dataSource as Record<string, unknown>).filter).toEqual({ column: 'x', operator: op, value: 1 })
      }
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

  describe('actions (action chains) validation', () => {
    it('valid chain with all 5 action types', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Go' },
          actions: [
            { type: 'writeData', key: 'step', value: 2 },
            { type: 'navigateTo', pageId: 'page2' },
            { type: 'toggleVisibility', key: 'showPanel' },
            { type: 'runFormula', formula: 'x + 1', outputKey: 'result' },
            { type: 'fetchUrl', url: 'https://api.example.com/data', outputKey: 'apiData' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(5)
      expect(result[0].actions![0]).toEqual({ type: 'writeData', key: 'step', value: 2 })
      expect(result[0].actions![1]).toEqual({ type: 'navigateTo', pageId: 'page2' })
      expect(result[0].actions![2]).toEqual({ type: 'toggleVisibility', key: 'showPanel' })
      expect(result[0].actions![3]).toEqual({ type: 'runFormula', formula: 'x + 1', outputKey: 'result' })
      expect(result[0].actions![4]).toEqual({ type: 'fetchUrl', url: 'https://api.example.com/data', outputKey: 'apiData' })
      expect(result[0].action).toBeUndefined()
    })

    it('max 5 steps: chain of 6 drops the 6th', () => {
      const actions = Array.from({ length: 6 }, (_, i) => ({
        type: 'writeData',
        key: `key${i}`,
        value: i,
      }))
      const result = validateUiComponents([
        { component: 'Button', props: { label: 'Test' }, actions },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(5)
      expect(result[0].actions![4]).toEqual({ type: 'writeData', key: 'key4', value: 4 })
    })

    it('invalid step type is dropped silently', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Test' },
          actions: [
            { type: 'writeData', key: 'ok', value: 1 },
            { type: 'unknownType', key: 'bad' },
            { type: 'writeData', key: 'ok2', value: 2 },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(2)
      expect(result[0].actions![0].type).toBe('writeData')
      expect(result[0].actions![1].type).toBe('writeData')
    })

    it('writeData with bad key is dropped', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Test' },
          actions: [
            { type: 'writeData', key: 'valid_key', value: 1 },
            { type: 'writeData', key: 'has spaces', value: 2 },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(1)
      expect(result[0].actions![0].key).toBe('valid_key')
    })

    it('writeData with delete-item mode and index is valid', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Delete' },
          actions: [
            { type: 'writeData', key: 'items', mode: 'delete-item', index: 3 },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(1)
      expect(result[0].actions![0]).toEqual({ type: 'writeData', key: 'items', mode: 'delete-item', index: 3 })
    })

    it('runFormula with invalid formula is dropped', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Test' },
          actions: [
            { type: 'runFormula', formula: '>>> invalid <<<', outputKey: 'result' },
            { type: 'writeData', key: 'fallback', value: 1 },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(1)
      expect(result[0].actions![0].type).toBe('writeData')
    })

    it('fetchUrl with http:// url is dropped', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Fetch' },
          actions: [
            { type: 'fetchUrl', url: 'http://example.com', outputKey: 'data' },
            { type: 'writeData', key: 'ok', value: 1 },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(1)
      expect(result[0].actions![0].type).toBe('writeData')
    })

    it('fetchUrl with missing outputKey is dropped', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Fetch' },
          actions: [
            { type: 'fetchUrl', url: 'https://example.com' },
            { type: 'writeData', key: 'ok', value: 1 },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(1)
      expect(result[0].actions![0].type).toBe('writeData')
    })

    it('old action field is migrated to actions[0] writeData; action removed', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Click' },
          action: { key: 'mood', value: 3 },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toEqual([{ type: 'writeData', key: 'mood', value: 3 }])
      expect(result[0].action).toBeUndefined()
    })

    it('old action with mode is migrated correctly', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: '+1' },
          action: { key: 'count', value: 1, mode: 'increment' },
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toEqual([{ type: 'writeData', key: 'count', value: 1, mode: 'increment' }])
      expect(result[0].action).toBeUndefined()
    })

    it('both action + actions present: action discarded, actions kept', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Test' },
          action: { key: 'old', value: 1 },
          actions: [
            { type: 'writeData', key: 'new', value: 2 },
            { type: 'navigateTo', pageId: 'p1' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions).toHaveLength(2)
      expect(result[0].actions![0]).toEqual({ type: 'writeData', key: 'new', value: 2 })
      expect(result[0].action).toBeUndefined()
    })

    it('Button with actions and no action is valid', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Navigate' },
          actions: [{ type: 'navigateTo', pageId: 'settings' }],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].component).toBe('Button')
      expect(result[0].actions).toEqual([{ type: 'navigateTo', pageId: 'settings' }])
    })

    it('empty array after filtering invalid steps: actions absent', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Bad' },
          actions: [
            { type: 'unknownAction' },
            { type: 'writeData', key: 'has spaces' },
          ],
        },
      ])
      // Button without valid action or actions is rejected
      expect(result).toHaveLength(0)
    })

    it('InputText with actions uses inputValue flow', () => {
      const result = validateUiComponents([
        {
          component: 'InputText',
          props: { label: 'Name' },
          actions: [{ type: 'writeData', key: 'name' }],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].component).toBe('InputText')
      expect(result[0].actions).toEqual([{ type: 'writeData', key: 'name' }])
    })

    it('fetchUrl with dataPath is preserved', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Fetch' },
          actions: [
            { type: 'fetchUrl', url: 'https://api.example.com/rates', outputKey: 'rate', dataPath: 'USD' },
          ],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions![0]).toEqual({
        type: 'fetchUrl',
        url: 'https://api.example.com/rates',
        outputKey: 'rate',
        dataPath: 'USD',
      })
    })

    it('writeData with invalid mode is stored without mode', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Test' },
          actions: [{ type: 'writeData', key: 'x', value: 1, mode: 'invalid_mode' }],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions![0]).toEqual({ type: 'writeData', key: 'x', value: 1 })
    })

    it('writeData with negative index ignores index', () => {
      const result = validateUiComponents([
        {
          component: 'Button',
          props: { label: 'Test' },
          actions: [{ type: 'writeData', key: 'items', mode: 'delete-item', index: -1 }],
        },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].actions![0]).toEqual({ type: 'writeData', key: 'items', mode: 'delete-item' })
    })
  })
})
