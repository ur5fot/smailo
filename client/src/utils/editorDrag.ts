/**
 * Utility functions for editor drag-and-drop and resize operations.
 */

const MIN_COL_SPAN = 1
const MAX_COL = 12

/**
 * Snap a component's col + colSpan to valid grid bounds.
 * Ensures col >= 1, colSpan >= 1, and col + colSpan <= 13.
 */
export function snapToGrid(col: number, colSpan: number): { col: number; colSpan: number } {
  let c = Math.max(1, Math.round(col))
  let s = Math.max(MIN_COL_SPAN, Math.round(colSpan))

  // Ensure col + colSpan doesn't exceed grid
  if (c + s > MAX_COL + 1) {
    s = MAX_COL + 1 - c
    if (s < MIN_COL_SPAN) {
      s = MIN_COL_SPAN
      c = MAX_COL
    }
  }

  return { col: c, colSpan: s }
}

/**
 * Calculate new colSpan from a resize drag.
 * @param startX - Mouse X position at drag start
 * @param currentX - Current mouse X position
 * @param gridColumnWidth - Width of one grid column in pixels
 * @param initialColSpan - Component's colSpan at drag start
 * @param col - Component's current start column
 */
export function calculateResizeColSpan(
  startX: number,
  currentX: number,
  gridColumnWidth: number,
  initialColSpan: number,
  col: number
): number {
  if (gridColumnWidth <= 0) return initialColSpan

  const deltaX = currentX - startX
  const deltaCols = Math.round(deltaX / gridColumnWidth)
  let newColSpan = initialColSpan + deltaCols

  // Clamp to valid range
  newColSpan = Math.max(MIN_COL_SPAN, newColSpan)
  newColSpan = Math.min(MAX_COL + 1 - col, newColSpan)

  return newColSpan
}

/**
 * Measure the width of a single grid column by reading the parent grid element.
 */
export function measureGridColumnWidth(gridElement: HTMLElement): number {
  const gridStyle = window.getComputedStyle(gridElement)
  const columnWidths = gridStyle.gridTemplateColumns.split(' ')
  if (columnWidths.length > 0) {
    const firstCol = parseFloat(columnWidths[0])
    if (!isNaN(firstCol)) return firstCol
  }
  // Fallback: divide container width by 12
  return gridElement.clientWidth / MAX_COL
}
