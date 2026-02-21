<template>
  <Panel :header="header" :toggleable="toggleable">
    <div v-if="value !== undefined && value !== null">
      <p v-if="typeof value === 'string' || typeof value === 'number'">{{ formatIfDate(value) }}</p>
      <pre v-else style="margin: 0; white-space: pre-wrap; font-size: 0.875rem;">{{ JSON.stringify(value, null, 2) }}</pre>
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
</style>
