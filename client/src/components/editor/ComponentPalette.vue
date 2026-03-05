<template>
  <div class="component-palette">
    <div
      v-for="category in COMPONENT_CATEGORIES"
      :key="category.label"
      class="component-palette__category"
    >
      <div class="component-palette__category-label">{{ category.label }}</div>
      <div class="component-palette__items">
        <div
          v-for="comp in category.components"
          :key="comp.type"
          class="component-palette__item"
          draggable="true"
          :title="comp.label"
          @dragstart="onDragStart($event, comp.type)"
          @dragend="onDragEnd"
        >
          <i :class="comp.icon" class="component-palette__icon" />
          <span class="component-palette__label">{{ comp.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { COMPONENT_CATEGORIES, getDefaultComponent } from '../../utils/componentDefaults'
import { useEditorStore } from '../../stores/editor'

const editorStore = useEditorStore()

function onDragStart(event: DragEvent, componentType: string) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-editor-component', componentType)
}

function onDragEnd() {
  // Drag ended without drop — nothing to do
}

function addComponent(componentType: string) {
  const component = getDefaultComponent(componentType)
  editorStore.addComponent(component)
}

defineExpose({ addComponent })
</script>

<style scoped>
.component-palette {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
}

.component-palette__category-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.35rem;
}

.component-palette__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.component-palette__item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.55rem;
  border: 1px solid #e5e7eb;
  border-radius: 1rem;
  background: #fff;
  font-size: 0.75rem;
  color: #374151;
  cursor: grab;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  user-select: none;
}

.component-palette__item:hover {
  border-color: #a5b4fc;
  background: #eef2ff;
  box-shadow: 0 1px 3px rgba(99, 102, 241, 0.1);
}

.component-palette__item:active {
  cursor: grabbing;
}

.component-palette__icon {
  font-size: 0.75rem;
  color: #6366f1;
}

.component-palette__label {
  white-space: nowrap;
}
</style>
