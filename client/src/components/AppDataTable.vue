<template>
  <div v-if="loading" class="app-datatable__loading">Загрузка...</div>
  <DataTable
    v-else
    :value="rows"
    :paginator="rows.length > 10"
    :rows="10"
    size="small"
    striped-rows
    class="app-datatable"
  >
    <template #empty>
      <span class="app-datatable__empty">Записей пока нет.</span>
    </template>
    <Column
      v-for="col in effectiveColumns"
      :key="col.field"
      :field="col.field"
      :header="col.header"
      sortable
    />
  </DataTable>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useAppStore } from '../stores/app'
import { buildTableCacheKey } from '../stores/app'
import type { FilterCondition } from '../stores/app'

interface ColumnDef {
  field: string
  header: string
}

const props = defineProps<{
  // data array bound from dataKey
  value?: any
  // optional explicit column definitions
  columns?: ColumnDef[]
  // table dataSource binding
  dataSource?: { type: 'table'; tableId: number; filter?: FilterCondition | FilterCondition[] }
  hash?: string
}>()

const appStore = useAppStore()
const loading = ref(false)

// Fetch table rows on mount when dataSource is present
watchEffect(async () => {
  if (props.dataSource?.type === 'table' && props.hash) {
    const tableId = props.dataSource.tableId
    const filter = props.dataSource.filter
    // Only fetch if not already cached (use filter-aware cache key)
    if (!appStore.tableData[buildTableCacheKey(tableId, filter)]) {
      loading.value = true
      try {
        await appStore.fetchTableRows(props.hash, tableId, filter)
      } finally {
        loading.value = false
      }
    }
  }
})

const rows = computed<any[]>(() => {
  // Table dataSource mode: get rows from store
  if (props.dataSource?.type === 'table') {
    const td = appStore.getTableData(props.dataSource.tableId, props.dataSource.filter)
    if (!td) return []
    // Flatten row data for DataTable (merge row.data fields + row.id)
    return td.rows.map((r) => ({ id: r.id, ...r.data as Record<string, unknown> }))
  }
  // Legacy dataKey mode
  if (Array.isArray(props.value)) return props.value
  if (props.value != null) return [props.value]
  return []
})

// Auto-generate columns from table schema or first row keys
const effectiveColumns = computed<ColumnDef[]>(() => {
  // Explicit columns always win
  if (props.columns && props.columns.length > 0) return props.columns

  // Table dataSource mode: generate from schema
  if (props.dataSource?.type === 'table') {
    const td = appStore.getTableData(props.dataSource.tableId, props.dataSource.filter)
    if (td) {
      return td.schema.columns.map((col) => ({ field: col.name, header: col.name }))
    }
    return []
  }

  // Legacy mode: infer from first row
  if (rows.value.length === 0) return []
  const first = rows.value[0]
  if (typeof first !== 'object' || first === null) {
    return [{ field: 'value', header: 'Value' }]
  }
  return Object.keys(first).map((key) => ({ field: key, header: key }))
})
</script>

<style scoped>
.app-datatable__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
}
.app-datatable__loading {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}
</style>
