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

  it('handles row=0 (falsy but valid number)', () => {
    // row=0 is technically invalid per schema (rows start at 1),
    // but gridItemStyle should not filter - that's validation's job
    const style = gridItemStyle({ col: 1, colSpan: 6, row: 0 })
    // row=0 is falsy, so it won't be set (0 == null is false, but 0 != null)
    expect(style.gridRow).toBe('0')
  })

  it('handles rowSpan without row (rowSpan ignored)', () => {
    const style = gridItemStyle({ col: 1, colSpan: 6, rowSpan: 2 })
    expect(style.gridRow).toBeUndefined()
  })

  it('handles single column width', () => {
    const style = gridItemStyle({ col: 5, colSpan: 1 })
    expect(style.gridColumn).toBe('5 / span 1')
  })
})
