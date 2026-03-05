<template>
  <div class="app-editor">
    <!-- Multi-page tabs -->
    <div v-if="editorStore.isMultiPage" class="app-editor__page-tabs">
      <button
        v-for="page in editorStore.editablePages"
        :key="page.id"
        class="app-editor__page-tab"
        :class="{ 'app-editor__page-tab--active': page.id === editorStore.activePage }"
        @click="editorStore.setActivePage(page.id)"
      >
        <i v-if="page.icon" :class="page.icon" class="app-editor__page-tab-icon" />
        {{ page.title }}
      </button>
    </div>

    <!-- Grid canvas -->
    <div v-if="components.length > 0" class="app-editor__grid">
      <!-- Visual grid lines -->
      <div class="app-editor__grid-lines">
        <div v-for="i in 12" :key="i" class="app-editor__grid-line" />
      </div>

      <!-- Component cards -->
      <EditorComponentCard
        v-for="(item, index) in components"
        :key="index"
        :component="item"
        :selected="editorStore.selectedComponentIndex === index"
        :style="gridItemStyle(item.layout)"
        @select="editorStore.selectComponent(index)"
        @delete="editorStore.removeComponent(index)"
      />
    </div>

    <!-- Empty placeholder -->
    <div v-else class="app-editor__placeholder">
      <i class="pi pi-pencil" style="font-size: 2rem; color: #9ca3af" />
      <p>Перетащите компоненты из палитры</p>
      <p class="app-editor__subtitle">или добавьте их через чат</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { gridItemStyle } from '../../utils/gridLayout'
import EditorComponentCard from './EditorComponentCard.vue'

const editorStore = useEditorStore()

const components = computed(() => editorStore.currentPageComponents)
</script>

<style scoped>
.app-editor {
  position: relative;
  min-height: 200px;
}

/* ── Page tabs ───────────────────────────────── */
.app-editor__page-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 0 0.75rem;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 0.75rem;
  overflow-x: auto;
}

.app-editor__page-tab {
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.app-editor__page-tab:hover {
  background: #f9fafb;
  color: #374151;
}

.app-editor__page-tab--active {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}

.app-editor__page-tab--active:hover {
  background: #4f46e5;
  color: #fff;
}

.app-editor__page-tab-icon {
  margin-right: 0.3rem;
  font-size: 0.75rem;
}

/* ── Grid canvas ─────────────────────────────── */
.app-editor__grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 0.75rem;
  position: relative;
  min-height: 100px;
}

.app-editor__grid > .editor-card {
  min-width: 0;
}

/* ── Visual grid lines ───────────────────────── */
.app-editor__grid-lines {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 0.75rem;
  pointer-events: none;
  z-index: 0;
}

.app-editor__grid-line {
  border-left: 1px dashed #f3f4f6;
  height: 100%;
}

.app-editor__grid-line:last-child {
  border-right: 1px dashed #f3f4f6;
}

.app-editor__grid > :not(.app-editor__grid-lines) {
  position: relative;
  z-index: 1;
  grid-column: 1 / -1;
}

/* ── Empty state ─────────────────────────────── */
.app-editor__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6b7280;
  text-align: center;
  min-height: 200px;
}

.app-editor__placeholder p {
  margin: 0;
}

.app-editor__subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
}

/* ── Mobile ──────────────────────────────────── */
@media (max-width: 767px) {
  .app-editor__grid > :not(.app-editor__grid-lines) {
    grid-column: 1 / -1 !important;
  }
}
</style>
