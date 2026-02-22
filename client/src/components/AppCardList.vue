<template>
  <div class="app-card-list">
    <div v-if="!items || items.length === 0" class="app-card-list__empty">
      Записей пока нет.
    </div>
    <div
      v-for="(item, index) in items"
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
        v-if="hash"
        class="app-card-list__delete"
        :disabled="deletingIndex === index"
        :aria-label="'Удалить'"
        @click="deleteItem(index)"
      >
        <i class="pi pi-times" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import api from '../api'
import { formatIfDate } from '../utils/format'

const props = defineProps<{
  value?: any
  hash?: string
  dataKey?: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const items = computed<any[]>(() => {
  if (Array.isArray(props.value)) return props.value
  return []
})

const deletingIndex = ref<number | null>(null)

function isValueTimestamp(item: any): item is { value: any; timestamp: string } {
  return item && typeof item === 'object' && 'value' in item && 'timestamp' in item
}

async function deleteItem(index: number) {
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
</style>
