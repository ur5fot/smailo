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

    it('works with Form component', () => {
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
