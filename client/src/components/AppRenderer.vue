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
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
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
  DataTable,
  Column,
  Chart,
  Timeline,
  Carousel,
  Knob,
  Tag,
  ProgressBar,
  Calendar: DatePicker,
}

function resolvedProps(item: UiConfigItem): Record<string, any> {
  const resolved = { ...item.props }
  if (item.dataKey && props.appData[item.dataKey] !== undefined) {
    const data = props.appData[item.dataKey]
    if ('value' in resolved || item.component === 'Knob' || item.component === 'ProgressBar' || item.component === 'Tag') {
      resolved.value = data
    } else if (item.component === 'DataTable' || item.component === 'Timeline' || item.component === 'Carousel') {
      resolved.value = data
    } else if (item.component === 'Chart') {
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
