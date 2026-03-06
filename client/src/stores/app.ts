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
  rlsEnabled?: boolean
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
    .sort((a, b) =>
      a.column.localeCompare(b.column)
      || (a.operator ?? 'eq').localeCompare(b.operator ?? 'eq')
      || JSON.stringify(a.value).localeCompare(JSON.stringify(b.value))
    )
  return `${tableId}:${JSON.stringify(normalized)}`
}

export type UserRole = 'owner' | 'editor' | 'viewer' | null

export interface MemberInfo {
  userId: string
  role: string
}

export const useAppStore = defineStore('app', () => {
  const appConfig = ref<Record<string, any> | null>(null)
  const appName = ref<string>('')
  const appData = ref<Record<string, any>[]>([])
  const isAuthenticated = ref(false)
  const myRole = ref<UserRole>(null)
  const members = ref<MemberInfo[]>([])

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
    myRole.value = res.data.myRole ?? null
    members.value = res.data.members ?? []

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
      rlsEnabled: res.data.rlsEnabled,
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

  function invalidateTableCache(tableId: number): void {
    const prefix = String(tableId)
    const newData = { ...tableData.value }
    for (const key of Object.keys(newData)) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        delete newData[key]
      }
    }
    tableData.value = newData
  }

  function clearTableCache() {
    tableData.value = {}
  }

  const pages = computed((): PageConfig[] | undefined => {
    const cfg = appConfig.value as any
    if (!cfg?.pages || !Array.isArray(cfg.pages)) return undefined
    return cfg.pages as PageConfig[]
  })

  async function fetchMembers(hash: string) {
    const res = await api.get(`/app/${hash}/members`)
    members.value = res.data
    return res.data as MemberInfo[]
  }

  async function createInvite(hash: string, role: 'editor' | 'viewer') {
    const res = await api.post(`/app/${hash}/members/invite`, { role })
    return res.data as { token: string; inviteUrl: string; expiresAt: string }
  }

  async function changeMemberRole(hash: string, userId: string, role: 'editor' | 'viewer') {
    const res = await api.put(`/app/${hash}/members/${userId}`, { role })
    return res.data
  }

  async function removeMember(hash: string, userId: string) {
    const res = await api.delete(`/app/${hash}/members/${userId}`)
    return res.data
  }

  async function toggleTableRls(hash: string, tableId: number, rlsEnabled: boolean) {
    const res = await api.put(`/app/${hash}/tables/${tableId}`, { rlsEnabled })
    // Update local tableSchemas
    const schema = tableSchemas.value.find(t => t.id === tableId)
    if (schema) {
      schema.rlsEnabled = rlsEnabled
    }
    return res.data
  }

  return {
    appConfig, appName, appData, isAuthenticated,
    myRole, members,
    tableSchemas, tableData, computedValues, pages,
    fetchApp, verifyPassword, fetchData, chatWithApp,
    fetchTableRows, getTableData, refreshTable, invalidateTableCache, clearTableCache,
    fetchMembers, createInvite, changeMemberRole, removeMember, toggleTableRls,
  }
})
