<template>
  <div v-if="loading" class="app-chart__loading">Загрузка...</div>
  <Chart
    v-else-if="chartData"
    :type="type"
    :data="chartData"
    :options="options"
  />
  <div v-else class="app-chart__empty">Нет данных для графика.</div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import Chart from 'primevue/chart'
import { useAppStore, buildTableCacheKey } from '../stores/app'
import { buildChartDataFromTable } from '../utils/chartData'
import type { FilterCondition } from '../stores/app'

const props = defineProps<{
  type?: string
  data?: any
  options?: any
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

const chartData = computed(() => {
  // Table dataSource mode: build chart data from table rows
  if (props.dataSource?.type === 'table') {
    const td = appStore.getTableData(props.dataSource.tableId, props.dataSource.filter)
    if (!td) return null
    return buildChartDataFromTable(td.schema.columns, td.rows, props.type)
  }
  // Legacy dataKey mode: use data prop directly
  return props.data ?? null
})
</script>

<style scoped>
.app-chart__loading {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}
.app-chart__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}
</style>
