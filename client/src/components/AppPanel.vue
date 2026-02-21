<template>
  <Panel :header="header" :toggleable="toggleable">
    <div v-if="value !== undefined && value !== null">
      <p v-if="typeof value === 'string' || typeof value === 'number'">{{ value }}</p>
      <pre v-else style="margin: 0; white-space: pre-wrap; font-size: 0.875rem;">{{ JSON.stringify(value, null, 2) }}</pre>
    </div>
    <div v-else class="app-panel__empty">Данных пока нет.</div>
  </Panel>
</template>

<script setup lang="ts">
import Panel from 'primevue/panel'

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
