<template>
  <div class="app-renderer">
    <template v-for="(item, index) in uiConfig" :key="index">
      <!-- Card: PrimeVue Card uses slots, not props — use wrapper -->
      <AppCard
        v-if="item.component === 'Card'"
        v-bind="resolvedProps(item)"
      />

      <!-- DataTable: needs auto-column generation -->
      <AppDataTable
        v-else-if="item.component === 'DataTable'"
        v-bind="resolvedProps(item)"
      />

      <!-- Button: user-triggered data write -->
      <AppButton
        v-else-if="item.component === 'Button' && item.action"
        :label="item.props?.label ?? ''"
        :severity="item.props?.severity"
        :action="item.action"
        :hash="props.hash"
        @data-written="emit('data-written')"
      />

      <!-- InputText: user-entered data write -->
      <AppInputText
        v-else-if="item.component === 'InputText' && item.action"
        :label="item.props?.label"
        :type="item.props?.type"
        :placeholder="item.props?.placeholder"
        :action="item.action"
        :hash="props.hash"
        @data-written="emit('data-written')"
      />

      <!-- Form: multi-field data write -->
      <AppForm
        v-else-if="item.component === 'Form' && item.fields && item.outputKey"
        :fields="item.fields"
        :output-key="item.outputKey"
        :submit-label="item.props?.submitLabel"
        :hash="props.hash"
        @data-written="emit('data-written')"
      />

      <!-- All other PrimeVue components via dynamic :is -->
      <component
        v-else-if="componentMap[item.component]"
        :is="componentMap[item.component]"
        v-bind="resolvedProps(item)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import Chart from 'primevue/chart'
import Timeline from 'primevue/timeline'
import Carousel from 'primevue/carousel'
import Knob from 'primevue/knob'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import DatePicker from 'primevue/datepicker'
import AppCard from './AppCard.vue'
import AppDataTable from './AppDataTable.vue'
import AppButton from './AppButton.vue'
import AppInputText from './AppInputText.vue'
import AppForm from './AppForm.vue'

interface UiConfigItem {
  component: string
  props: Record<string, any>
  dataKey?: string
  action?: { key: string; value?: unknown }
  fields?: Array<{ name: string; type: string; label: string }>
  outputKey?: string
}

const props = defineProps<{
  uiConfig: UiConfigItem[]
  appData: Record<string, any>
  hash: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const componentMap: Record<string, any> = {
  Chart,
  Timeline,
  Carousel,
  Knob,
  Tag,
  ProgressBar,
  Calendar: DatePicker,
}

// Strip event handler props (keys starting with 'on') to prevent stored XSS.
function isSafeProp(key: string): boolean {
  return !key.toLowerCase().startsWith('on')
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
