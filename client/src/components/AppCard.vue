<template>
  <Card>
    <template v-if="title" #title>{{ title }}</template>
    <template v-if="subtitle" #subtitle>{{ subtitle }}</template>
    <template #content>
      <!-- No data at all -->
      <div v-if="resolvedValue === undefined || resolvedValue === null" class="app-card__empty">
        <i class="pi pi-inbox app-card__empty-icon" />
        <span>No data yet. Ask Smailo below to add entries.</span>
      </div>

      <!-- Array: render as list -->
      <ul v-else-if="Array.isArray(resolvedValue)" class="app-card__list">
        <li v-if="resolvedValue.length === 0" class="app-card__empty-item">
          No entries yet.
        </li>
        <li
          v-for="(item, i) in resolvedValue"
          :key="i"
          class="app-card__list-item"
        >
          <template v-if="item && typeof item === 'object'">
            <span v-for="(val, key) in item" :key="key" class="app-card__kv">
              <span class="app-card__kv-key">{{ key }}:</span>
              <span class="app-card__kv-val">{{ val }}</span>
            </span>
          </template>
          <template v-else>{{ item }}</template>
        </li>
      </ul>

      <!-- Object: render key-value pairs -->
      <dl v-else-if="typeof resolvedValue === 'object'" class="app-card__dl">
        <template v-for="(val, key) in resolvedValue" :key="key">
          <dt class="app-card__dt">{{ key }}</dt>
          <dd class="app-card__dd">{{ val }}</dd>
        </template>
      </dl>

      <!-- Primitive: render as text -->
      <p v-else class="app-card__text">{{ resolvedValue }}</p>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Card from 'primevue/card'

const props = defineProps<{
  title?: string
  subtitle?: string
  // value is bound from dataKey resolution in AppRenderer
  value?: any
}>()

const resolvedValue = computed(() => props.value)
</script>

<style scoped>
.app-card__empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #9ca3af;
  font-size: 0.875rem;
  padding: 0.5rem 0;
}

.app-card__empty-icon {
  font-size: 1.1rem;
}

.app-card__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.app-card__empty-item {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
}

.app-card__list-item {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9rem;
  color: #111827;
}

.app-card__list-item:last-child {
  border-bottom: none;
}

.app-card__kv {
  display: flex;
  gap: 0.25rem;
}

.app-card__kv-key {
  color: #6b7280;
  font-weight: 500;
}

.app-card__kv-val {
  color: #111827;
}

.app-card__dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

.app-card__dt {
  color: #6b7280;
  font-weight: 500;
}

.app-card__dd {
  margin: 0;
  color: #111827;
}

.app-card__text {
  margin: 0;
  font-size: 0.9rem;
  color: #111827;
}
</style>
