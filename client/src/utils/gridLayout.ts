export interface LayoutMeta {
  col: number
  colSpan: number
  row?: number
  rowSpan?: number
}

export function gridItemStyle(layout?: LayoutMeta): Record<string, string> {
  const style: Record<string, string> = {}
  if (layout) {
    const col = Math.max(1, Math.min(12, Math.round(Number(layout.col) || 1)))
    const colSpan = Math.max(1, Math.min(13 - col, Math.round(Number(layout.colSpan) || 12)))
    style.gridColumn = `${col} / span ${colSpan}`
    if (layout.row != null) {
      const row = Math.max(1, Math.round(Number(layout.row) || 1))
      if (layout.rowSpan != null) {
        const rowSpan = Math.max(1, Math.round(Number(layout.rowSpan) || 1))
        style.gridRow = `${row} / span ${rowSpan}`
      } else {
        style.gridRow = `${row}`
      }
    }
  }
  return style
}
