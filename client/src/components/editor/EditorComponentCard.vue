<template>
  <div
    class="editor-card"
    :class="{ 'editor-card--selected': selected, 'editor-card--resizing': isResizing }"
    @click="$emit('select')"
  >
    <div class="editor-card__header">
      <i class="editor-card__drag-handle pi pi-bars" />
      <i :class="iconClass" class="editor-card__type-icon" />
      <span class="editor-card__type">{{ component.component }}</span>
      <button class="editor-card__delete" title="Удалить" @click.stop="$emit('delete')">
        <i class="pi pi-times" />
      </button>
    </div>
    <div class="editor-card__body">
      <span v-if="label" class="editor-card__label">{{ label }}</span>
      <span v-if="dataInfo" class="editor-card__data-info">{{ dataInfo }}</span>
      <span v-if="!label && !dataInfo" class="editor-card__empty">No data binding</span>
    </div>
    <!-- Resize handle -->
    <div
      class="editor-card__resize-handle"
      @mousedown.stop.prevent="onResizeStart"
    >
      <i class="pi pi-arrows-h" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UiComponent } from '../../stores/editor'
import { calculateResizeColSpan, measureGridColumnWidth } from '../../utils/editorDrag'

const props = defineProps<{
  component: UiComponent
  index: number
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  delete: []
  resize: [newColSpan: number]
}>()

const isResizing = ref(false)

const COMPONENT_ICONS: Record<string, string> = {
  Card: 'pi pi-id-card',
  DataTable: 'pi pi-table',
  Chart: 'pi pi-chart-bar',
  Timeline: 'pi pi-clock',
  Knob: 'pi pi-circle',
  Tag: 'pi pi-tag',
  ProgressBar: 'pi pi-percentage',
  Calendar: 'pi pi-calendar',
  Button: 'pi pi-bolt',
  InputText: 'pi pi-pencil',
  Form: 'pi pi-file-edit',
  Accordion: 'pi pi-list',
  Panel: 'pi pi-window-maximize',
  Chip: 'pi pi-tag',
  Badge: 'pi pi-bell',
  Slider: 'pi pi-sliders-h',
  Rating: 'pi pi-star',
  Tabs: 'pi pi-folder',
  Image: 'pi pi-image',
  MeterGroup: 'pi pi-chart-line',
  CardList: 'pi pi-th-large',
  ConditionalGroup: 'pi pi-filter',
}

const iconClass = computed(() => COMPONENT_ICONS[props.component.component] || 'pi pi-box')

const label = computed(() => {
  const p = props.component.props
  if (p?.header) return String(p.header)
  if (p?.label) return String(p.label)
  if (p?.title) return String(p.title)
  return ''
})

const dataInfo = computed(() => {
  if (props.component.dataSource) {
    return `table:${props.component.dataSource.tableId}`
  }
  if (props.component.computedValue) {
    return props.component.computedValue.length > 30
      ? props.component.computedValue.slice(0, 30) + '...'
      : props.component.computedValue
  }
  if (props.component.dataKey) {
    return props.component.dataKey
  }
  return ''
})

function onResizeStart(e: MouseEvent) {
  const startX = e.clientX
  const initialColSpan = props.component.layout?.colSpan ?? 12
  const col = props.component.layout?.col ?? 1

  // Find the parent grid element
  const cardEl = (e.target as HTMLElement).closest('.editor-card')
  const gridEl = cardEl?.parentElement
  if (!gridEl) return

  const gridColumnWidth = measureGridColumnWidth(gridEl)
  isResizing.value = true

  let lastEmittedColSpan = initialColSpan

  function onMouseMove(moveEvt: MouseEvent) {
    const newColSpan = calculateResizeColSpan(startX, moveEvt.clientX, gridColumnWidth, initialColSpan, col)
    if (newColSpan !== lastEmittedColSpan) {
      lastEmittedColSpan = newColSpan
      emit('resize', newColSpan)
    }
  }

  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.editor-card {
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  overflow: hidden;
  position: relative;
}

.editor-card:hover {
  border-color: #a5b4fc;
}

.editor-card--selected {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.editor-card--resizing {
  user-select: none;
}

.editor-card__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
  background: #f9fafb;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.8rem;
}

.editor-card__drag-handle {
  cursor: grab;
  color: #9ca3af;
  font-size: 0.75rem;
}

.editor-card__drag-handle:active {
  cursor: grabbing;
}

.editor-card__type-icon {
  color: #6366f1;
  font-size: 0.8rem;
}

.editor-card__type {
  font-weight: 600;
  color: #374151;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-card__delete {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 0.15rem;
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  transition: color 0.15s, background 0.15s;
}

.editor-card__delete:hover {
  color: #ef4444;
  background: #fef2f2;
}

.editor-card__body {
  padding: 0.35rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-height: 1.5rem;
}

.editor-card__label {
  font-size: 0.75rem;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-card__data-info {
  font-size: 0.7rem;
  color: #6b7280;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-card__empty {
  font-size: 0.7rem;
  color: #d1d5db;
  font-style: italic;
}

/* ── Resize handle ──────────────────────────── */
.editor-card__resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 12px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
  background: rgba(99, 102, 241, 0.05);
}

.editor-card:hover .editor-card__resize-handle,
.editor-card--resizing .editor-card__resize-handle {
  opacity: 1;
}

.editor-card__resize-handle:hover {
  background: rgba(99, 102, 241, 0.15);
}

.editor-card__resize-handle i {
  font-size: 0.6rem;
  color: #6366f1;
}
</style>
