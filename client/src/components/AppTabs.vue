<template>
  <Tabs :value="activeTab">
    <TabList>
      <Tab
        v-for="(tab, index) in tabs"
        :key="index"
        :value="String(index)"
      >
        {{ tab.label }}
      </Tab>
    </TabList>
    <TabPanels>
      <TabPanel
        v-for="(tab, index) in tabs"
        :key="index"
        :value="String(index)"
      >
        <div v-if="tab.dataKey && resolvedData(tab.dataKey) !== undefined">
          <p v-if="typeof resolvedData(tab.dataKey) === 'string' || typeof resolvedData(tab.dataKey) === 'number'">
            {{ resolvedData(tab.dataKey) }}
          </p>
          <pre v-else style="margin: 0; white-space: pre-wrap; font-size: 0.875rem;">{{ JSON.stringify(resolvedData(tab.dataKey), null, 2) }}</pre>
        </div>
        <div v-else class="app-tabs__empty">Данных пока нет.</div>
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'

const props = defineProps<{
  tabs: Array<{ label: string; dataKey?: string }>
  appData?: Record<string, any>
}>()

const activeTab = ref('0')

// Reset active tab when tabs are replaced (e.g. after a uiUpdate from AI chat)
watch(() => props.tabs, () => { activeTab.value = '0' })

function resolvedData(dataKey: string): any {
  return props.appData?.[dataKey]
}
</script>

<style scoped>
.app-tabs__empty {
  color: #9ca3af;
  font-size: 0.875rem;
  font-style: italic;
  padding: 0.5rem 0;
}
</style>
