<template>
  <Panel :header="header" :toggleable="toggleable">
    <div v-if="value !== undefined && value !== null">
      <!-- Array: render as list -->
      <ul v-if="Array.isArray(value)" class="app-panel__list">
        <li v-if="value.length === 0" class="app-panel__empty">Записей пока нет.</li>
        <li v-for="(item, i) in value" :key="i" class="app-panel__list-item">
          <template v-if="item && typeof item === 'object'">
            <span v-for="(val, key) in item" :key="key" class="app-panel__kv">
              <span class="app-panel__kv-key">{{ key }}:</span>
              <span class="app-panel__kv-val">{{ formatIfDate(val) }}</span>
            </span>
          </template>
          <template v-else>{{ formatIfDate(item) }}</template>
        </li>
      </ul>
      <!-- Object: render key-value pairs -->
      <dl v-else-if="typeof value === 'object'" class="app-panel__dl">
        <template v-for="(val, key) in value" :key="key">
          <dt class="app-panel__dt">{{ key }}</dt>
          <dd class="app-panel__dd">{{ formatIfDate(val) }}</dd>
        </template>
      </dl>
      <!-- Primitive -->
      <p v-else class="app-panel__text">{{ formatIfDate(value) }}</p>
    </div>
    <div v-else class="app-panel__empty">Данных пока нет.</div>
  </Panel>
</template>

<script setup lang="ts">
import Panel from 'primevue/panel'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

function formatIfDate(val: any): any {
  if (typeof val !== 'string' || !ISO_RE.test(val)) return val
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return val
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d)
  } catch {
    return val
  }
}

defineProps<{
  header?: string
  toggleable?: boolean
  value?: any
}>()
</script>

<style scoped>
.app-panel__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
}

.app-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.app-panel__list-item {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9rem;
  color: #111827;
}

.app-panel__list-item:last-child {
  border-bottom: none;
}

.app-panel__kv {
  display: flex;
  gap: 0.25rem;
}

.app-panel__kv-key {
  color: #6b7280;
  font-weight: 500;
}

.app-panel__kv-val {
  color: #111827;
}

.app-panel__dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

.app-panel__dt {
  color: #6b7280;
  font-weight: 500;
}

.app-panel__dd {
  margin: 0;
  color: #111827;
}

.app-panel__text {
  margin: 0;
  font-size: 0.9rem;
  color: #111827;
}
</style>
