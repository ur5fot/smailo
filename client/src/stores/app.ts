import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export interface PageConfig {
  id: string
  title: string
  icon?: string
  uiComponents: any[]
}

export interface TableColumn {
  name: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'formula'
  required?: boolean
  options?: string[]
  formula?: string
}

export interface TableSchema {
  id: number
  name: string
  columns: TableColumn[]
  createdAt: string
}

export interface TableRow {
  id: number
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string | null
}

export type FilterOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains';

export interface FilterCondition {
  column: string;
  operator?: FilterOperator;
  value: string | number | boolean;
}

export function buildTableCacheKey(tableId: number, filter?: FilterCondition | FilterCondition[]): string {
  if (!filter) return String(tableId)
  const normalized = (Array.isArray(filter) ? filter : [filter])
    .slice()
    .sort((a, b) => a.column.localeCompare(b.column))
  return `${tableId}:${JSON.stringify(normalized)}`
}

export const useAppStore = defineStore('app', () => {
  const appConfig = ref<Record<string, any> | null>(null)
  const appName = ref<string>('')
  const appData = ref<Record<string, any>[]>([])
  const isAuthenticated = ref(false)

  // Table data: schemas from fetchApp(), rows fetched on demand per table
  const tableSchemas = ref<TableSchema[]>([])
  const tableData = ref<Record<string, { schema: TableSchema; rows: TableRow[] }>>({})

  // Computed values from server-side formula evaluation (keyed by component index)
  const computedValues = ref<Record<number, unknown>>({})

  async function fetchApp(hash: string) {
    const res = await api.get(`/app/${hash}`)
    appConfig.value = res.data.config
    appName.value = res.data.appName || ''
    appData.value = res.data.appData || []
    isAuthenticated.value = true

    // Populate table schemas and clear cached row/computed data
    tableSchemas.value = res.data.tables || []
    tableData.value = {}
    computedValues.value = {}

    return res.data
  }

  async function verifyPassword(hash: string, pwd: string) {
    const res = await api.post(`/app/${hash}/verify`, { password: pwd })
    const token = res.data.token
    if (token) {
      localStorage.setItem(`smailo_token_${hash}`, token)
      isAuthenticated.value = true
    }
    return token
  }

  async function fetchData(hash: string) {
    const res = await api.get(`/app/${hash}/data`)
    appData.value = res.data.appData || []
    computedValues.value = res.data.computedValues || {}
    return res.data
  }

  async function chatWithApp(hash: string, message: string) {
    const res = await api.post(`/app/${hash}/chat`, { message })
    return res.data as { mood: string; message: string; uiUpdate?: any[]; pagesUpdate?: any[] }
  }

  async function fetchTableRows(hash: string, tableId: number, filter?: FilterCondition | FilterCondition[]): Promise<TableRow[]> {
    const key = buildTableCacheKey(tableId, filter)
    if (tableData.value[key]) {
      return tableData.value[key].rows
    }
    const params: Record<string, string> = {}
    if (filter) {
      params.filter = JSON.stringify(filter)
    }
    const res = await api.get(`/app/${hash}/tables/${tableId}`, { params })
    const schema: TableSchema = {
      id: res.data.id,
      name: res.data.name,
      columns: res.data.columns,
      createdAt: res.data.createdAt,
    }
    const rows: TableRow[] = res.data.rows || []
    tableData.value = { ...tableData.value, [key]: { schema, rows } }
    return rows
  }

  function getTableData(tableId: number, filter?: FilterCondition | FilterCondition[]): { schema: TableSchema; rows: TableRow[] } | null {
    const key = buildTableCacheKey(tableId, filter)
    // Check cached row data first
    const cached = tableData.value[key]
    if (cached) return cached
    // Fall back to schema-only (no rows loaded yet)
    const schema = tableSchemas.value.find(t => t.id === tableId)
    if (schema) return { schema, rows: [] }
    return null
  }

  async function refreshTable(hash: string, tableId: number, filter?: FilterCondition | FilterCondition[]): Promise<TableRow[]> {
    const key = buildTableCacheKey(tableId, filter)
    const newData = { ...tableData.value }
    delete newData[key]
    tableData.value = newData
    return fetchTableRows(hash, tableId, filter)
  }

  function clearTableCache() {
    tableData.value = {}
  }

  const pages = computed((): PageConfig[] | undefined => {
    const cfg = appConfig.value as any
    if (!cfg?.pages || !Array.isArray(cfg.pages)) return undefined
    return cfg.pages as PageConfig[]
  })

  return {
    appConfig, appName, appData, isAuthenticated,
    tableSchemas, tableData, computedValues, pages,
    fetchApp, verifyPassword, fetchData, chatWithApp,
    fetchTableRows, getTableData, refreshTable, clearTableCache,
  }
})
