<template>
  <div class="app-card-list">
    <div v-if="isRlsActive" class="app-card-list__rls-badge" title="Row-Level Security: viewer видит только свои строки">
      <i class="pi pi-lock" /> RLS
    </div>
    <!-- Loading state for table mode -->
    <div v-if="isTableMode && loading" class="app-card-list__empty">
      Загрузка...
    </div>

    <div v-else-if="!displayItems || displayItems.length === 0" class="app-card-list__empty">
      Записей пока нет.
    </div>

    <!-- Table mode: render rows as cards using schema columns -->
    <template v-if="isTableMode">
      <div
        v-for="row in tableRows"
        :key="row.id"
        class="app-card-list__item"
      >
        <div class="app-card-list__content">
          <div
            v-for="col in tableColumns"
            :key="col.name"
            class="app-card-list__kv"
          >
            <span class="app-card-list__kv-key">{{ col.name }}:</span>
            <span class="app-card-list__kv-val">{{ formatCellValue(row.data[col.name], col.type) }}</span>
          </div>
        </div>

        <button
          v-if="hash && appStore.myRole !== 'viewer'"
          class="app-card-list__delete"
          :disabled="deletingId === row.id"
          :aria-label="'Удалить'"
          @click="deleteTableRow(row.id)"
        >
          <i class="pi pi-times" />
        </button>
      </div>
    </template>

    <!-- KV mode: existing behavior -->
    <template v-else>
      <div
        v-for="(item, index) in kvItems"
        :key="index"
        class="app-card-list__item"
      >
        <div class="app-card-list__content">
          <!-- { value, timestamp } from InputText append -->
          <template v-if="isValueTimestamp(item)">
            <span class="app-card-list__main">{{ item.value }}</span>
            <span class="app-card-list__sub">{{ formatIfDate(item.timestamp) }}</span>
          </template>
          <!-- Generic object: key-value pairs -->
          <template v-else-if="item && typeof item === 'object'">
            <div
              v-for="(val, key) in item"
              :key="key"
              class="app-card-list__kv"
            >
              <span class="app-card-list__kv-key">{{ key }}:</span>
              <span class="app-card-list__kv-val">{{ formatIfDate(val) }}</span>
            </div>
          </template>
          <!-- Primitive fallback -->
          <template v-else>
            <span class="app-card-list__main">{{ formatIfDate(item) }}</span>
          </template>
        </div>

        <button
          v-if="hash && appStore.myRole !== 'viewer'"
          class="app-card-list__delete"
          :disabled="deletingIndex === index"
          :aria-label="'Удалить'"
          @click="deleteKvItem(index)"
        >
          <i class="pi pi-times" />
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import api from '../api'
import { useAppStore, buildTableCacheKey } from '../stores/app'
import { formatIfDate } from '../utils/format'
import type { TableRow, TableColumn, FilterCondition } from '../stores/app'

const props = defineProps<{
  value?: any
  hash?: string
  dataKey?: string
  dataSource?: { type: 'table'; tableId: number; filter?: FilterCondition | FilterCondition[] }
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const appStore = useAppStore()

const isTableMode = computed(() => props.dataSource?.type === 'table')
const loading = ref(false)

const isRlsActive = computed(() => {
  if (!props.dataSource?.tableId) return false
  const schema = appStore.tableSchemas.find(t => t.id === props.dataSource!.tableId)
  return schema?.rlsEnabled ?? false
})

// Table mode: fetch rows on mount / when tableId changes
watchEffect(async () => {
  if (!isTableMode.value || !props.hash || !props.dataSource) return
  const tableId = props.dataSource.tableId
  const filter = props.dataSource.filter
  // Only fetch if no cached rows yet (use filter-aware cache key)
  if (!appStore.tableData[buildTableCacheKey(tableId, filter)]) {
    loading.value = true
    try {
      await appStore.fetchTableRows(props.hash, tableId, filter)
    } finally {
      loading.value = false
    }
  }
})

// Table mode computed
const tableData = computed(() => {
  if (!isTableMode.value || !props.dataSource) return null
  return appStore.getTableData(props.dataSource.tableId, props.dataSource.filter)
})

const tableRows = computed<TableRow[]>(() => tableData.value?.rows ?? [])
const tableColumns = computed<TableColumn[]>(() => tableData.value?.schema.columns ?? [])

// KV mode computed (existing behavior)
const kvItems = computed<any[]>(() => {
  if (Array.isArray(props.value)) return props.value
  return []
})

// Unified display items for empty state check
const displayItems = computed(() => {
  if (isTableMode.value) return tableRows.value
  return kvItems.value
})

// Format cell value for table display
function formatCellValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '—'
  if (type === 'boolean') return value ? 'Да' : 'Нет'
  if (type === 'date') return String(formatIfDate(value))
  return String(value)
}

// Delete for table mode
const deletingId = ref<number | null>(null)

async function deleteTableRow(rowId: number) {
  if (!props.hash || !props.dataSource) return
  deletingId.value = rowId
  try {
    await api.delete(`/app/${props.hash}/tables/${props.dataSource.tableId}/rows/${rowId}`)
    appStore.invalidateTableCache(props.dataSource.tableId)
    emit('data-written')
  } finally {
    deletingId.value = null
  }
}

// Delete for KV mode (existing behavior)
const deletingIndex = ref<number | null>(null)

function isValueTimestamp(item: any): item is { value: any; timestamp: string } {
  return item && typeof item === 'object' && 'value' in item && 'timestamp' in item
}

async function deleteKvItem(index: number) {
  if (!props.hash || !props.dataKey) return
  deletingIndex.value = index
  try {
    await api.post(`/app/${props.hash}/data`, {
      key: props.dataKey,
      mode: 'delete-item',
      index,
    })
    emit('data-written')
  } finally {
    deletingIndex.value = null
  }
}
</script>

<style scoped>
.app-card-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.app-card-list__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
  text-align: center;
  padding: 1rem;
}

.app-card-list__item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.app-card-list__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.app-card-list__main {
  font-size: 0.95rem;
  color: #111827;
  font-weight: 500;
}

.app-card-list__sub {
  font-size: 0.75rem;
  color: #9ca3af;
}

.app-card-list__kv {
  display: flex;
  gap: 0.4rem;
  font-size: 0.875rem;
}

.app-card-list__kv-key {
  color: #6b7280;
  font-weight: 500;
  flex-shrink: 0;
}

.app-card-list__kv-val {
  color: #111827;
}

.app-card-list__delete {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #d1d5db;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  padding: 0;
  font-size: 0.7rem;
}

.app-card-list__delete:hover:not(:disabled) {
  background: #fee2e2;
  color: #ef4444;
}

.app-card-list__delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-card-list__rls-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  margin-bottom: 0.4rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  border-radius: 0.25rem;
}
.app-card-list__rls-badge i {
  font-size: 0.65rem;
}
</style>
