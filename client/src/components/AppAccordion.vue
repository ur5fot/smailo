<template>
  <Accordion v-model:value="openTabs">
    <AccordionPanel
      v-for="(tab, index) in tabs"
      :key="index"
      :value="String(index)"
    >
      <AccordionHeader>{{ tab.header }}</AccordionHeader>
      <AccordionContent>
        <div v-if="tab.dataKey && resolvedData(tab.dataKey) !== undefined">
          <!-- Array: render as list -->
          <ul v-if="Array.isArray(resolvedData(tab.dataKey))" class="app-accordion__list">
            <li v-if="resolvedData(tab.dataKey).length === 0" class="app-accordion__empty">Записей пока нет.</li>
            <li v-for="(item, i) in resolvedData(tab.dataKey)" :key="i" class="app-accordion__list-item">
              <template v-if="item && typeof item === 'object'">
                <span v-for="(val, key) in item" :key="key" class="app-accordion__kv">
                  <span class="app-accordion__kv-key">{{ key }}:</span>
                  <span class="app-accordion__kv-val">{{ formatIfDate(val) }}</span>
                </span>
              </template>
              <template v-else>{{ formatIfDate(item) }}</template>
            </li>
          </ul>
          <!-- Object: render key-value pairs -->
          <dl v-else-if="typeof resolvedData(tab.dataKey) === 'object'" class="app-accordion__dl">
            <template v-for="(val, key) in resolvedData(tab.dataKey)" :key="key">
              <dt class="app-accordion__dt">{{ key }}</dt>
              <dd class="app-accordion__dd">{{ formatIfDate(val) }}</dd>
            </template>
          </dl>
          <!-- Primitive -->
          <p v-else class="app-accordion__text">{{ formatIfDate(resolvedData(tab.dataKey)) }}</p>
        </div>
        <div v-else-if="tab.content">{{ tab.content }}</div>
        <div v-else class="app-accordion__empty">Данных пока нет.</div>
      </AccordionContent>
    </AccordionPanel>
  </Accordion>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import { formatIfDate } from '../utils/format'
import { resolveDataKey } from '../utils/dataKey'

const props = defineProps<{
  tabs: Array<{ header: string; dataKey?: string; content?: string }>
  appData?: Record<string, any>
}>()

// Keep first tab open by default; must be a ref so PrimeVue v-model can update it on toggle
const openTabs = ref('0')

// Reset open state when tabs are replaced (e.g. after a uiUpdate from AI chat)
watch(() => props.tabs, () => { openTabs.value = '0' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvedData(dataKey: string): any {
  if (!props.appData) return undefined
  return resolveDataKey(props.appData, dataKey)
}
</script>

<style scoped>
.app-accordion__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
}

.app-accordion__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.app-accordion__list-item {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9rem;
  color: #111827;
}

.app-accordion__list-item:last-child {
  border-bottom: none;
}

.app-accordion__kv {
  display: flex;
  gap: 0.25rem;
}

.app-accordion__kv-key {
  color: #6b7280;
  font-weight: 500;
}

.app-accordion__kv-val {
  color: #111827;
}

.app-accordion__dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  margin: 0;
  font-size: 0.9rem;
}

.app-accordion__dt {
  color: #6b7280;
  font-weight: 500;
}

.app-accordion__dd {
  margin: 0;
  color: #111827;
}

.app-accordion__text {
  margin: 0;
  font-size: 0.9rem;
  color: #111827;
}
</style>
