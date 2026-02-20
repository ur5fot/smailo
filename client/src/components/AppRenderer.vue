<template>
  <div class="app-renderer">
    <template v-for="(item, index) in uiConfig" :key="index">
      <component
        :is="componentMap[item.component]"
        v-if="componentMap[item.component]"
        v-bind="resolvedProps(item)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import Card from 'primevue/card'
import Chart from 'primevue/chart'
import Timeline from 'primevue/timeline'
import Carousel from 'primevue/carousel'
import Knob from 'primevue/knob'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import DatePicker from 'primevue/datepicker'

interface UiConfigItem {
  component: string
  props: Record<string, any>
  dataKey?: string
}

const props = defineProps<{
  uiConfig: UiConfigItem[]
  appData: Record<string, any>
}>()

const componentMap: Record<string, any> = {
  Card,
  Chart,
  Timeline,
  Carousel,
  Knob,
  Tag,
  ProgressBar,
  Calendar: DatePicker,
}

// Strip event handler props (keys starting with 'on') from AI-controlled component
// configs to prevent stored XSS via injected event handler bindings.
const BLOCKED_PROP_PREFIXES = ['on']
function isSafeProp(key: string): boolean {
  const lower = key.toLowerCase()
  return !BLOCKED_PROP_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

function resolvedProps(item: UiConfigItem): Record<string, any> {
  const safeProps = Object.fromEntries(
    Object.entries(item.props ?? {}).filter(([key]) => isSafeProp(key))
  )
  const resolved = { ...safeProps }
  if (item.dataKey && props.appData[item.dataKey] !== undefined) {
    const data = props.appData[item.dataKey]
    if (item.component === 'Chart') {
      resolved.data = data
    } else {
      resolved.value = data
    }
  }
  return resolved
}
</script>

<style scoped>
.app-renderer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
