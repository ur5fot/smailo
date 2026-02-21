<template>
  <DataTable
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
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

interface ColumnDef {
  field: string
  header: string
}

const props = defineProps<{
  // data array bound from dataKey
  value?: any
  // optional explicit column definitions
  columns?: ColumnDef[]
}>()

const rows = computed<any[]>(() => {
  if (Array.isArray(props.value)) return props.value
  if (props.value != null) return [props.value]
  return []
})

// Auto-generate columns from first row keys when no explicit columns given
const effectiveColumns = computed<ColumnDef[]>(() => {
  if (props.columns && props.columns.length > 0) return props.columns
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
</style>
