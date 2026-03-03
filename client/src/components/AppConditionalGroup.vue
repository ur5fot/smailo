<template>
  <component
    :is="AppRenderer"
    v-if="isVisible"
    :ui-config="children"
    :app-data="appData"
    :hash="hash"
    @data-written="emit('data-written')"
  />
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { buildFormulaContext } from '../utils/formulaContext'
import { evaluateShowIf } from '../utils/showIf'
import type { StyleIfCondition } from '../utils/styleIf'

// Break circular dependency: AppRenderer → AppConditionalGroup → AppRenderer
const AppRenderer = defineAsyncComponent(() => import('./AppRenderer.vue'))

interface UiConfigItem {
  component: string
  props: Record<string, any>
  dataKey?: string
  dataSource?: { type: 'table'; tableId: number }
  computedValue?: string
  action?: { key: string; value?: unknown; mode?: 'append' }
  fields?: Array<{ name: string; type: string; label: string }>
  outputKey?: string
  appendMode?: boolean
  showIf?: string
  styleIf?: StyleIfCondition[]
  condition?: string
  children?: UiConfigItem[]
}

const props = defineProps<{
  condition: string
  children: UiConfigItem[]
  hash: string
  appData: Record<string, any>
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const isVisible = computed(() => {
  const context = buildFormulaContext(props.appData)
  return evaluateShowIf(props.condition, context)
})
</script>
