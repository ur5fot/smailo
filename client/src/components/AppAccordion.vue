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
          <p v-if="typeof resolvedData(tab.dataKey) === 'string' || typeof resolvedData(tab.dataKey) === 'number'">
            {{ resolvedData(tab.dataKey) }}
          </p>
          <pre v-else style="margin: 0; white-space: pre-wrap; font-size: 0.875rem;">{{ JSON.stringify(resolvedData(tab.dataKey), null, 2) }}</pre>
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

const props = defineProps<{
  tabs: Array<{ header: string; dataKey?: string; content?: string }>
  appData?: Record<string, any>
}>()

// Keep first tab open by default; must be a ref so PrimeVue v-model can update it on toggle
const openTabs = ref('0')

// Reset open state when tabs are replaced (e.g. after a uiUpdate from AI chat)
watch(() => props.tabs, () => { openTabs.value = '0' })

function resolvedData(dataKey: string): any {
  return props.appData?.[dataKey]
}
</script>

<style scoped>
.app-accordion__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
}
</style>
