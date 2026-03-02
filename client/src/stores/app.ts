import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export interface TableColumn {
  name: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'select'
  required?: boolean
  options?: string[]
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

export const useAppStore = defineStore('app', () => {
  const appConfig = ref<Record<string, any> | null>(null)
  const appName = ref<string>('')
  const appData = ref<Record<string, any>[]>([])
  const isAuthenticated = ref(false)

  // Table data: schemas from fetchApp(), rows fetched on demand per table
  const tableSchemas = ref<TableSchema[]>([])
  const tableData = ref<Record<number, { schema: TableSchema; rows: TableRow[] }>>({})

  async function fetchApp(hash: string) {
    const res = await api.get(`/app/${hash}`)
    appConfig.value = res.data.config
    appName.value = res.data.appName || ''
    appData.value = res.data.appData || []
    isAuthenticated.value = true

    // Populate table schemas and clear cached row data
    tableSchemas.value = res.data.tables || []
    tableData.value = {}

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
    return res.data
  }

  async function chatWithApp(hash: string, message: string) {
    const res = await api.post(`/app/${hash}/chat`, { message })
    return res.data as { mood: string; message: string; uiUpdate?: any[] }
  }

  async function fetchTableRows(hash: string, tableId: number): Promise<TableRow[]> {
    const res = await api.get(`/app/${hash}/tables/${tableId}`)
    const schema: TableSchema = {
      id: res.data.id,
      name: res.data.name,
      columns: res.data.columns,
      createdAt: res.data.createdAt,
    }
    const rows: TableRow[] = res.data.rows || []
    tableData.value = { ...tableData.value, [tableId]: { schema, rows } }
    return rows
  }

  function getTableData(tableId: number): { schema: TableSchema; rows: TableRow[] } | null {
    // Check cached row data first
    const cached = tableData.value[tableId]
    if (cached) return cached
    // Fall back to schema-only (no rows loaded yet)
    const schema = tableSchemas.value.find(t => t.id === tableId)
    if (schema) return { schema, rows: [] }
    return null
  }

  async function refreshTable(hash: string, tableId: number): Promise<TableRow[]> {
    return fetchTableRows(hash, tableId)
  }

  return {
    appConfig, appName, appData, isAuthenticated,
    tableSchemas, tableData,
    fetchApp, verifyPassword, fetchData, chatWithApp,
    fetchTableRows, getTableData, refreshTable,
  }
})
