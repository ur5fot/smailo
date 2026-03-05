import { describe, it, expect } from 'vitest'
import { snapToGrid, calculateResizeColSpan } from '../editorDrag'

describe('snapToGrid', () => {
  it('returns valid col and colSpan for normal values', () => {
    expect(snapToGrid(1, 6)).toEqual({ col: 1, colSpan: 6 })
    expect(snapToGrid(7, 6)).toEqual({ col: 7, colSpan: 6 })
  })

  it('rounds fractional values', () => {
    expect(snapToGrid(1.4, 5.6)).toEqual({ col: 1, colSpan: 6 })
    expect(snapToGrid(2.7, 3.2)).toEqual({ col: 3, colSpan: 3 })
  })

  it('clamps col to minimum 1', () => {
    expect(snapToGrid(0, 6)).toEqual({ col: 1, colSpan: 6 })
    expect(snapToGrid(-5, 4)).toEqual({ col: 1, colSpan: 4 })
  })

  it('clamps colSpan to minimum 1', () => {
    expect(snapToGrid(1, 0)).toEqual({ col: 1, colSpan: 1 })
    expect(snapToGrid(5, -3)).toEqual({ col: 5, colSpan: 1 })
  })

  it('constrains col + colSpan <= 13', () => {
    // col=10, colSpan=5 → 10 + 5 = 15 > 13, so colSpan should be reduced to 3
    expect(snapToGrid(10, 5)).toEqual({ col: 10, colSpan: 3 })
  })

  it('handles edge case col=12, colSpan=1', () => {
    expect(snapToGrid(12, 1)).toEqual({ col: 12, colSpan: 1 })
  })

  it('handles full width', () => {
    expect(snapToGrid(1, 12)).toEqual({ col: 1, colSpan: 12 })
  })

  it('handles col + colSpan overflow at extreme values', () => {
    expect(snapToGrid(12, 12)).toEqual({ col: 12, colSpan: 1 })
  })
})

describe('calculateResizeColSpan', () => {
  const gridColWidth = 80 // 80px per column

  it('returns initial colSpan when no movement', () => {
    expect(calculateResizeColSpan(100, 100, gridColWidth, 6, 1)).toBe(6)
  })

  it('increases colSpan when dragging right', () => {
    // Dragging right by 2 columns (160px)
    expect(calculateResizeColSpan(100, 260, gridColWidth, 6, 1)).toBe(8)
  })

  it('decreases colSpan when dragging left', () => {
    // Dragging left by 3 columns (240px)
    expect(calculateResizeColSpan(300, 60, gridColWidth, 6, 1)).toBe(3)
  })

  it('clamps minimum colSpan to 1', () => {
    // Dragging left a lot
    expect(calculateResizeColSpan(500, 0, gridColWidth, 3, 1)).toBe(1)
  })

  it('clamps maximum colSpan so col + colSpan <= 13', () => {
    // Starting at col 8, initial colSpan 4 → max colSpan = 5
    // Dragging right by 10 columns
    expect(calculateResizeColSpan(100, 900, gridColWidth, 4, 8)).toBe(5)
  })

  it('returns initial colSpan when gridColumnWidth is 0', () => {
    expect(calculateResizeColSpan(100, 300, 0, 6, 1)).toBe(6)
  })

  it('rounds to nearest column', () => {
    // 30px movement with 80px columns → rounds to 0 columns
    expect(calculateResizeColSpan(100, 130, gridColWidth, 6, 1)).toBe(6)
    // 50px movement → rounds to 1 column
    expect(calculateResizeColSpan(100, 150, gridColWidth, 6, 1)).toBe(7)
  })
})
