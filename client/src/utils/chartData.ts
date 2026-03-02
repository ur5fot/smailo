/**
 * Builds Chart.js-compatible data from user-defined table rows.
 *
 * Strategy:
 *  - First non-numeric column → labels
 *  - All numeric columns → datasets
 *  - For pie/doughnut: only the first numeric column becomes a single dataset
 */

interface ColumnDef {
  name: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'select'
}

interface TableRow {
  id: number
  data: Record<string, unknown>
}

// Preset palette for chart datasets (chart.js defaults are fine, but explicit is clearer)
const DATASET_COLORS = [
  'rgba(59, 130, 246, 0.7)',   // blue
  'rgba(239, 68, 68, 0.7)',    // red
  'rgba(34, 197, 94, 0.7)',    // green
  'rgba(234, 179, 8, 0.7)',    // yellow
  'rgba(168, 85, 247, 0.7)',   // purple
  'rgba(249, 115, 22, 0.7)',   // orange
  'rgba(20, 184, 166, 0.7)',   // teal
  'rgba(236, 72, 153, 0.7)',   // pink
]

const DATASET_BORDER_COLORS = [
  'rgba(59, 130, 246, 1)',
  'rgba(239, 68, 68, 1)',
  'rgba(34, 197, 94, 1)',
  'rgba(234, 179, 8, 1)',
  'rgba(168, 85, 247, 1)',
  'rgba(249, 115, 22, 1)',
  'rgba(20, 184, 166, 1)',
  'rgba(236, 72, 153, 1)',
]

export interface ChartData {
  labels: string[]
  datasets: Array<{
    label: string
    data: number[]
    backgroundColor?: string | string[]
    borderColor?: string | string[]
    borderWidth?: number
  }>
}

export function buildChartDataFromTable(
  columns: ColumnDef[],
  rows: TableRow[],
  chartType?: string,
): ChartData | null {
  if (!columns || columns.length === 0) return null

  const numericColumns = columns.filter(c => c.type === 'number')
  if (numericColumns.length === 0) return null

  // First non-numeric column provides labels; fall back to row index
  const labelColumn = columns.find(c => c.type !== 'number')
  const labels = rows.map((row, i) => {
    if (!labelColumn) return String(i + 1)
    const val = row.data[labelColumn.name]
    return val != null ? String(val) : ''
  })

  const isPieType = chartType === 'pie' || chartType === 'doughnut' || chartType === 'polarArea'

  if (isPieType) {
    // Pie/doughnut: single dataset from first numeric column, one color per segment
    const col = numericColumns[0]
    const data = rows.map(row => {
      const v = row.data[col.name]
      return typeof v === 'number' ? v : 0
    })
    const bgColors = data.map((_, i) => DATASET_COLORS[i % DATASET_COLORS.length])
    const borderColors = data.map((_, i) => DATASET_BORDER_COLORS[i % DATASET_BORDER_COLORS.length])

    return {
      labels,
      datasets: [{
        label: col.name,
        data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
      }],
    }
  }

  // Bar/line/radar: one dataset per numeric column
  const datasets = numericColumns.map((col, idx) => {
    const data = rows.map(row => {
      const v = row.data[col.name]
      return typeof v === 'number' ? v : 0
    })
    return {
      label: col.name,
      data,
      backgroundColor: DATASET_COLORS[idx % DATASET_COLORS.length],
      borderColor: DATASET_BORDER_COLORS[idx % DATASET_BORDER_COLORS.length],
      borderWidth: 1,
    }
  })

  return { labels, datasets }
}
