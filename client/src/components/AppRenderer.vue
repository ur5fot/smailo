<template>
  <div class="app-renderer">
    <template v-for="(item, index) in uiConfig" :key="index">
      <div v-if="shouldShow(item, index)" :class="getConditionalClasses(item, index)" :style="gridItemStyle(item)">
      <!-- Card: PrimeVue Card uses slots, not props — use wrapper -->
      <AppCard
        v-if="item.component === 'Card'"
        v-bind="resolvedProps(item, index)"
      />

      <!-- DataTable: needs auto-column generation -->
      <AppDataTable
        v-else-if="item.component === 'DataTable'"
        v-bind="resolvedProps(item, index)"
        :data-source="item.dataSource"
        :hash="props.hash"
      />

      <!-- Button: user-triggered data write -->
      <AppButton
        v-else-if="item.component === 'Button' && (item.actions || item.action)"
        :label="item.props?.label ?? ''"
        :severity="item.props?.severity"
        :action="item.action"
        :actions="item.actions"
        :hash="props.hash"
        :current-page-id="currentPageId"
        @data-written="emit('data-written')"
      />

      <!-- InputText: user-entered data write -->
      <AppInputText
        v-else-if="item.component === 'InputText' && (item.actions || item.action)"
        :label="item.props?.label"
        :type="item.props?.type"
        :placeholder="item.props?.placeholder"
        :action="item.action"
        :actions="item.actions"
        :hash="props.hash"
        :current-page-id="currentPageId"
        @data-written="emit('data-written')"
      />

      <!-- Form: multi-field data write (traditional fields+outputKey or table dataSource) -->
      <AppForm
        v-else-if="item.component === 'Form' && (item.dataSource || (item.fields && item.outputKey))"
        :fields="item.fields"
        :output-key="item.outputKey"
        :submit-label="item.props?.submitLabel"
        :append-mode="item.appendMode"
        :hash="props.hash"
        :data-source="item.dataSource"
        :actions="item.actions"
        :current-page-id="currentPageId"
        @data-written="emit('data-written')"
      />

      <!-- Accordion: collapsible sections with slot-based content -->
      <AppAccordion
        v-else-if="item.component === 'Accordion'"
        :tabs="item.props?.tabs ?? []"
        :app-data="props.appData"
      />

      <!-- Panel: titled panel with slot-based content -->
      <AppPanel
        v-else-if="item.component === 'Panel'"
        v-bind="resolvedProps(item, index)"
      />

      <!-- CardList: dynamic card-per-item list from appData array, with per-item delete -->
      <AppCardList
        v-else-if="item.component === 'CardList'"
        v-bind="resolvedProps(item, index)"
        :data-key="item.dataKey"
        :hash="props.hash"
        :data-source="item.dataSource"
        @data-written="emit('data-written')"
      />

      <!-- Tabs: tabbed interface -->
      <AppTabs
        v-else-if="item.component === 'Tabs'"
        :tabs="item.props?.tabs ?? []"
        :app-data="props.appData"
      />

      <!-- Chart: wrapper handles both dataSource (table) and dataKey (KV) modes -->
      <AppChart
        v-else-if="item.component === 'Chart'"
        v-bind="resolvedProps(item, index)"
        :data-source="item.dataSource"
        :hash="props.hash"
      />

      <!-- ConditionalGroup: conditionally renders a group of child components -->
      <AppConditionalGroup
        v-else-if="item.component === 'ConditionalGroup' && item.condition && item.children"
        :condition="item.condition"
        :children="item.children"
        :hash="props.hash"
        :app-data="props.appData"
        @data-written="emit('data-written')"
      />

      <!-- All other PrimeVue components via dynamic :is -->
      <component
        v-else-if="componentMap[item.component]"
        :is="componentMap[item.component]"
        v-bind="resolvedProps(item, index)"
      />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Timeline from 'primevue/timeline'
import Knob from 'primevue/knob'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'
import DatePicker from 'primevue/datepicker'
import Chip from 'primevue/chip'
import Badge from 'primevue/badge'
import Slider from 'primevue/slider'
import Rating from 'primevue/rating'
import Image from 'primevue/image'
import MeterGroup from 'primevue/metergroup'
import AppCard from './AppCard.vue'
import AppDataTable from './AppDataTable.vue'
import AppButton from './AppButton.vue'
import AppInputText from './AppInputText.vue'
import AppForm from './AppForm.vue'
import AppAccordion from './AppAccordion.vue'
import AppPanel from './AppPanel.vue'
import AppTabs from './AppTabs.vue'
import AppCardList from './AppCardList.vue'
import AppChart from './AppChart.vue'
import AppConditionalGroup from './AppConditionalGroup.vue'
import { resolveDataKey } from '../utils/dataKey'
import { useAppStore } from '../stores/app'
import type { FilterCondition } from '../stores/app'
import { buildFormulaContext } from '../utils/formulaContext'
import type { ActionStep } from '../utils/actionExecutor'
import { evaluateShowIf } from '../utils/showIf'
import type { StyleIfCondition } from '../utils/styleIf'
import { getConditionalClasses as computeConditionalClasses } from '../utils/conditionalClasses'
import { gridItemStyle as computeGridItemStyle } from '../utils/gridLayout'
import '../assets/conditional-styles.css'

interface UiConfigItem {
  component: string
  props: Record<string, any>
  dataKey?: string
  dataSource?: { type: 'table'; tableId: number; filter?: FilterCondition | FilterCondition[] }
  computedValue?: string
  action?: { key: string; value?: unknown; mode?: 'append' }
  actions?: ActionStep[]
  fields?: Array<{ name: string; type: string; label: string }>
  outputKey?: string
  appendMode?: boolean
  showIf?: string
  styleIf?: StyleIfCondition[]
  condition?: string
  children?: UiConfigItem[]
  layout?: {
    col: number
    colSpan: number
    row?: number
    rowSpan?: number
  }
}

const props = defineProps<{
  uiConfig: UiConfigItem[]
  appData: Record<string, any>
  hash: string
  computedValues?: Record<number, unknown>
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const appStore = useAppStore()
const route = useRoute()
const currentPageId = computed(() => route.params.pageId as string | undefined)

// Build formula context once per appData change, shared across all shouldShow/getConditionalClasses calls
const formulaContext = computed(() => buildFormulaContext(props.appData))

function shouldShow(item: UiConfigItem, _index: number): boolean {
  // For ConditionalGroup, check condition to avoid phantom flex gaps when the group is hidden
  if (item.component === 'ConditionalGroup' && item.condition) {
    return evaluateShowIf(item.condition, formulaContext.value)
  }
  if (!item.showIf) return true
  return evaluateShowIf(item.showIf, formulaContext.value)
}

function getConditionalClasses(item: UiConfigItem, _index: number): string[] {
  return computeConditionalClasses(item.styleIf, props.appData)
}

function gridItemStyle(item: UiConfigItem): Record<string, string> {
  return computeGridItemStyle(item.layout)
}

const componentMap: Record<string, any> = {
  Timeline,
  Knob,
  Tag,
  ProgressBar,
  Calendar: DatePicker,
  Chip,
  Badge,
  Slider,
  Rating,
  Image,
  MeterGroup,
}

// Strip event handler props (keys starting with 'on') to prevent stored XSS.
function isSafeProp(key: string): boolean {
  return !key.toLowerCase().startsWith('on')
}

function resolvedProps(item: UiConfigItem, index: number): Record<string, any> {
  const safeProps = Object.fromEntries(
    Object.entries(item.props ?? {}).filter(([key]) => isSafeProp(key))
  )
  const resolved = { ...safeProps }

  // Priority: dataSource (handled by wrapper components) > computedValue > dataKey
  let data: unknown
  if (item.dataSource) {
    // dataSource takes priority — data fetching is handled by wrapper components
  } else if (item.computedValue) {
    const cvMap = props.computedValues ?? appStore.computedValues
    if (index in cvMap) data = cvMap[index]
  } else if (item.dataKey !== undefined) {
    data = resolveDataKey(props.appData, item.dataKey)
  }

  if (data !== undefined) {
    if (item.component === 'Chart') {
      resolved.data = data
    } else if (item.component === 'Image') {
      resolved.src = data
    } else if (item.component === 'Chip') {
      // PrimeVue Chip displays the `label` prop, not `value`
      resolved.label = data
    } else {
      resolved.value = data
    }
  }
  // Ensure display-only components are not interactive
  if (item.component === 'Slider') {
    resolved.disabled = true
  } else if (item.component === 'Rating') {
    resolved.readonly = true
  }
  return resolved
}
</script>

<style scoped>
.app-renderer {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1rem;
}

.app-renderer > div {
  grid-column: 1 / -1;
  min-width: 0;
}

@media (max-width: 767px) {
  .app-renderer > div {
    grid-column: 1 / -1 !important;
  }
}
</style>
