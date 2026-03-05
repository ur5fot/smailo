export interface LayoutMeta {
  col: number
  colSpan: number
  row?: number
  rowSpan?: number
}

export function gridItemStyle(layout?: LayoutMeta): Record<string, string> {
  const style: Record<string, string> = {}
  if (layout) {
    style.gridColumn = `${layout.col} / span ${layout.colSpan}`
    if (layout.row != null) {
      style.gridRow = layout.rowSpan != null
        ? `${layout.row} / span ${layout.rowSpan}`
        : `${layout.row}`
    }
  }
  return style
}
