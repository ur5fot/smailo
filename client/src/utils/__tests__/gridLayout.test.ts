import { describe, it, expect } from 'vitest'
import { gridItemStyle } from '../gridLayout'

describe('gridItemStyle', () => {
  it('returns empty style when no layout is provided', () => {
    expect(gridItemStyle(undefined)).toEqual({})
  })

  it('sets gridColumn from col and colSpan', () => {
    const style = gridItemStyle({ col: 1, colSpan: 6 })
    expect(style.gridColumn).toBe('1 / span 6')
    expect(style.gridRow).toBeUndefined()
  })

  it('sets gridColumn for full-width span', () => {
    const style = gridItemStyle({ col: 1, colSpan: 12 })
    expect(style.gridColumn).toBe('1 / span 12')
  })

  it('sets gridColumn for partial-width at offset', () => {
    const style = gridItemStyle({ col: 7, colSpan: 6 })
    expect(style.gridColumn).toBe('7 / span 6')
  })

  it('sets gridRow when row is provided without rowSpan', () => {
    const style = gridItemStyle({ col: 1, colSpan: 6, row: 2 })
    expect(style.gridColumn).toBe('1 / span 6')
    expect(style.gridRow).toBe('2')
  })

  it('sets gridRow with span when both row and rowSpan are provided', () => {
    const style = gridItemStyle({ col: 1, colSpan: 4, row: 1, rowSpan: 3 })
    expect(style.gridColumn).toBe('1 / span 4')
    expect(style.gridRow).toBe('1 / span 3')
  })

  it('handles row=0 by clamping to 1', () => {
    // row=0 is invalid per schema (rows start at 1), clamped defensively
    const style = gridItemStyle({ col: 1, colSpan: 6, row: 0 })
    expect(style.gridRow).toBe('1')
  })

  it('handles rowSpan without row (rowSpan ignored)', () => {
    const style = gridItemStyle({ col: 1, colSpan: 6, rowSpan: 2 })
    expect(style.gridRow).toBeUndefined()
  })

  it('handles single column width', () => {
    const style = gridItemStyle({ col: 5, colSpan: 1 })
    expect(style.gridColumn).toBe('5 / span 1')
  })

  // Sanitization tests
  it('clamps col below 1 to 1', () => {
    const style = gridItemStyle({ col: 0, colSpan: 6 })
    expect(style.gridColumn).toBe('1 / span 6')
  })

  it('clamps col above 12 to 12', () => {
    const style = gridItemStyle({ col: 15, colSpan: 1 })
    expect(style.gridColumn).toBe('12 / span 1')
  })

  it('clamps colSpan so col + colSpan does not exceed 13', () => {
    const style = gridItemStyle({ col: 10, colSpan: 8 })
    expect(style.gridColumn).toBe('10 / span 3')
  })

  it('rounds float col and colSpan to integers', () => {
    const style = gridItemStyle({ col: 2.7, colSpan: 5.3 })
    expect(style.gridColumn).toBe('3 / span 5')
  })

  it('handles NaN col by defaulting to 1', () => {
    const style = gridItemStyle({ col: NaN, colSpan: 6 })
    expect(style.gridColumn).toBe('1 / span 6')
  })

  it('handles NaN colSpan by defaulting to full width', () => {
    const style = gridItemStyle({ col: 1, colSpan: NaN })
    expect(style.gridColumn).toBe('1 / span 12')
  })

  it('clamps row below 1 to 1', () => {
    const style = gridItemStyle({ col: 1, colSpan: 6, row: -5 })
    expect(style.gridRow).toBe('1')
  })

  it('clamps rowSpan below 1 to 1', () => {
    const style = gridItemStyle({ col: 1, colSpan: 6, row: 1, rowSpan: 0 })
    expect(style.gridRow).toBe('1 / span 1')
  })
})
