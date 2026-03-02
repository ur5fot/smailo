import { describe, it, expect } from 'vitest'
import { buildChartDataFromTable } from '../../../client/src/utils/chartData.js'
import type { ChartData } from '../../../client/src/utils/chartData.js'

describe('buildChartDataFromTable', () => {
  it('returns null when columns is empty', () => {
    expect(buildChartDataFromTable([], [])).toBeNull()
  })

  it('returns null when there are no numeric columns', () => {
    const columns = [
      { name: 'name', type: 'text' as const },
      { name: 'done', type: 'boolean' as const },
    ]
    expect(buildChartDataFromTable(columns, [])).toBeNull()
  })

  it('builds bar chart data with labels from first text column', () => {
    const columns = [
      { name: 'category', type: 'text' as const },
      { name: 'amount', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { category: 'Food', amount: 100 } },
      { id: 2, data: { category: 'Transport', amount: 50 } },
      { id: 3, data: { category: 'Housing', amount: 200 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'bar')!

    expect(result).not.toBeNull()
    expect(result.labels).toEqual(['Food', 'Transport', 'Housing'])
    expect(result.datasets).toHaveLength(1)
    expect(result.datasets[0].label).toBe('amount')
    expect(result.datasets[0].data).toEqual([100, 50, 200])
    // Bar chart: single color per dataset (string), not per-segment (array)
    expect(typeof result.datasets[0].backgroundColor).toBe('string')
  })

  it('builds line chart with multiple numeric columns as separate datasets', () => {
    const columns = [
      { name: 'month', type: 'text' as const },
      { name: 'income', type: 'number' as const },
      { name: 'expenses', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { month: 'Jan', income: 3000, expenses: 2000 } },
      { id: 2, data: { month: 'Feb', income: 3200, expenses: 2100 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'line')!

    expect(result.labels).toEqual(['Jan', 'Feb'])
    expect(result.datasets).toHaveLength(2)
    expect(result.datasets[0].label).toBe('income')
    expect(result.datasets[0].data).toEqual([3000, 3200])
    expect(result.datasets[1].label).toBe('expenses')
    expect(result.datasets[1].data).toEqual([2000, 2100])
  })

  it('builds pie chart with one dataset and per-segment colors', () => {
    const columns = [
      { name: 'category', type: 'text' as const },
      { name: 'amount', type: 'number' as const },
      { name: 'count', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { category: 'Food', amount: 100, count: 5 } },
      { id: 2, data: { category: 'Transport', amount: 50, count: 3 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'pie')!

    expect(result.labels).toEqual(['Food', 'Transport'])
    // Pie uses only the first numeric column
    expect(result.datasets).toHaveLength(1)
    expect(result.datasets[0].label).toBe('amount')
    expect(result.datasets[0].data).toEqual([100, 50])
    // Per-segment colors (array, not string)
    expect(Array.isArray(result.datasets[0].backgroundColor)).toBe(true)
    expect((result.datasets[0].backgroundColor as string[]).length).toBe(2)
  })

  it('builds doughnut chart same as pie (per-segment colors)', () => {
    const columns = [
      { name: 'label', type: 'text' as const },
      { name: 'value', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { label: 'A', value: 10 } },
      { id: 2, data: { label: 'B', value: 20 } },
      { id: 3, data: { label: 'C', value: 30 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'doughnut')!

    expect(result.datasets).toHaveLength(1)
    expect(Array.isArray(result.datasets[0].backgroundColor)).toBe(true)
  })

  it('builds polarArea chart same as pie (per-segment colors)', () => {
    const columns = [
      { name: 'label', type: 'text' as const },
      { name: 'value', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { label: 'X', value: 5 } },
      { id: 2, data: { label: 'Y', value: 15 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'polarArea')!

    expect(result.datasets).toHaveLength(1)
    expect(Array.isArray(result.datasets[0].backgroundColor)).toBe(true)
  })

  it('uses row index as labels when all columns are numeric', () => {
    const columns = [
      { name: 'x', type: 'number' as const },
      { name: 'y', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { x: 1, y: 10 } },
      { id: 2, data: { x: 2, y: 20 } },
      { id: 3, data: { x: 3, y: 30 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'bar')!

    expect(result.labels).toEqual(['1', '2', '3'])
    expect(result.datasets).toHaveLength(2)
  })

  it('handles empty rows gracefully', () => {
    const columns = [
      { name: 'name', type: 'text' as const },
      { name: 'score', type: 'number' as const },
    ]
    const result = buildChartDataFromTable(columns, [], 'bar')!

    expect(result).not.toBeNull()
    expect(result.labels).toEqual([])
    expect(result.datasets).toHaveLength(1)
    expect(result.datasets[0].data).toEqual([])
  })

  it('treats non-numeric values in number columns as 0', () => {
    const columns = [
      { name: 'item', type: 'text' as const },
      { name: 'price', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { item: 'A', price: 10 } },
      { id: 2, data: { item: 'B', price: null } },
      { id: 3, data: { item: 'C', price: undefined } },
      { id: 4, data: { item: 'D', price: 'not a number' } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'bar')!

    expect(result.datasets[0].data).toEqual([10, 0, 0, 0])
  })

  it('converts null/undefined label values to empty string', () => {
    const columns = [
      { name: 'name', type: 'text' as const },
      { name: 'value', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { name: null, value: 5 } },
      { id: 2, data: { value: 10 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'bar')!

    expect(result.labels).toEqual(['', ''])
  })

  it('defaults to bar-style (multi-dataset) when chartType is undefined', () => {
    const columns = [
      { name: 'label', type: 'text' as const },
      { name: 'a', type: 'number' as const },
      { name: 'b', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { label: 'Row1', a: 1, b: 2 } },
    ]
    const result = buildChartDataFromTable(columns, rows)!

    expect(result.datasets).toHaveLength(2)
    // Not pie-style (per-segment colors)
    expect(typeof result.datasets[0].backgroundColor).toBe('string')
  })

  it('uses first non-numeric column for labels (skips leading number columns)', () => {
    const columns = [
      { name: 'id_num', type: 'number' as const },
      { name: 'category', type: 'select' as const },
      { name: 'amount', type: 'number' as const },
    ]
    const rows = [
      { id: 1, data: { id_num: 1, category: 'Food', amount: 50 } },
      { id: 2, data: { id_num: 2, category: 'Transport', amount: 30 } },
    ]
    const result = buildChartDataFromTable(columns, rows, 'bar')!

    // select column is non-numeric, should be used for labels
    expect(result.labels).toEqual(['Food', 'Transport'])
    // Both number columns become datasets
    expect(result.datasets).toHaveLength(2)
    expect(result.datasets[0].label).toBe('id_num')
    expect(result.datasets[1].label).toBe('amount')
  })
})
