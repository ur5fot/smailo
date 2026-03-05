<template>
  <div class="app-editor">
    <!-- Multi-page tabs -->
    <div class="app-editor__page-tabs">
      <div v-if="editorStore.isMultiPage" class="app-editor__page-tabs-list">
        <div
          v-for="(page, idx) in editorStore.editablePages"
          :key="page.id"
          class="app-editor__page-tab"
          :class="{ 'app-editor__page-tab--active': page.id === editorStore.activePage }"
          draggable="true"
          @click="editorStore.setActivePage(page.id)"
          @dragstart="onPageDragStart(idx, $event)"
          @dragover.prevent="onPageDragOver(idx, $event)"
          @drop.prevent="onPageDrop(idx)"
          @dragend="pageDragFrom = null"
        >
          <i v-if="page.icon" :class="page.icon" class="app-editor__page-tab-icon" />
          <span class="app-editor__page-tab-title">{{ page.title }}</span>
          <button
            v-if="editorStore.editablePages!.length > 1"
            class="app-editor__page-tab-close"
            title="Удалить страницу"
            @click.stop="confirmRemovePage(page.id, page.title)"
          >
            <i class="pi pi-times" />
          </button>
        </div>
      </div>
      <button class="app-editor__add-page-btn" title="Добавить страницу" @click="showAddPageDialog = true">
        <i class="pi pi-plus" />
      </button>
    </div>

    <!-- Active page properties (inline edit) -->
    <div v-if="editorStore.isMultiPage && activePageData" class="app-editor__page-props">
      <div class="app-editor__page-prop">
        <label class="app-editor__page-prop-label">ID</label>
        <span class="app-editor__page-prop-value">{{ activePageData.id }}</span>
      </div>
      <div class="app-editor__page-prop">
        <label class="app-editor__page-prop-label">Заголовок</label>
        <input
          class="app-editor__page-prop-input"
          :value="activePageData.title"
          @change="onPageTitleChange"
        />
      </div>
      <div class="app-editor__page-prop">
        <label class="app-editor__page-prop-label">Иконка</label>
        <input
          class="app-editor__page-prop-input"
          :value="activePageData.icon || ''"
          placeholder="pi pi-home"
          @change="onPageIconChange"
        />
      </div>
    </div>

    <!-- Add page dialog -->
    <div v-if="showAddPageDialog" class="app-editor__dialog-overlay" @click.self="showAddPageDialog = false">
      <div class="app-editor__dialog">
        <h3 class="app-editor__dialog-title">Новая страница</h3>
        <div class="app-editor__dialog-field">
          <label>ID (URL)</label>
          <input v-model="newPage.id" class="app-editor__dialog-input" placeholder="my-page" />
          <span v-if="newPageIdError" class="app-editor__dialog-error">{{ newPageIdError }}</span>
        </div>
        <div class="app-editor__dialog-field">
          <label>Заголовок</label>
          <input v-model="newPage.title" class="app-editor__dialog-input" placeholder="Моя страница" />
        </div>
        <div class="app-editor__dialog-field">
          <label>Иконка (опционально)</label>
          <input v-model="newPage.icon" class="app-editor__dialog-input" placeholder="pi pi-home" />
        </div>
        <div class="app-editor__dialog-actions">
          <button class="app-editor__dialog-btn app-editor__dialog-btn--cancel" @click="showAddPageDialog = false">Отмена</button>
          <button class="app-editor__dialog-btn app-editor__dialog-btn--confirm" :disabled="!canAddPage" @click="handleAddPage">Добавить</button>
        </div>
      </div>
    </div>

    <!-- Confirm remove page dialog -->
    <div v-if="pageToRemove" class="app-editor__dialog-overlay" @click.self="pageToRemove = null">
      <div class="app-editor__dialog">
        <p class="app-editor__dialog-text">Удалить страницу "{{ pageToRemove.title }}" и все её компоненты?</p>
        <div class="app-editor__dialog-actions">
          <button class="app-editor__dialog-btn app-editor__dialog-btn--cancel" @click="pageToRemove = null">Отмена</button>
          <button class="app-editor__dialog-btn app-editor__dialog-btn--danger" @click="handleRemovePage">Удалить</button>
        </div>
      </div>
    </div>

    <!-- Grid canvas -->
    <VueDraggable
      v-if="components.length > 0"
      v-model="components"
      tag="div"
      class="app-editor__grid"
      handle=".editor-card__drag-handle"
      :group="{ name: 'editor-components', pull: true, put: true }"
      :animation="200"
      ghost-class="app-editor__ghost"
      @update="onDragUpdate"
      @dragover.prevent="onGridDragOver"
      @drop.prevent="onGridDrop"
    >
      <!-- Visual grid lines (non-draggable) -->
      <div class="app-editor__grid-lines" data-no-drag>
        <div v-for="i in 12" :key="'line-' + i" class="app-editor__grid-line" />
      </div>

      <!-- Component cards -->
      <EditorComponentCard
        v-for="(item, index) in components"
        :key="item._editorId || index"
        :component="item"
        :index="index"
        :selected="editorStore.selectedComponentIndex === index"
        :style="gridItemStyle(item.layout)"
        @select="editorStore.selectComponent(index)"
        @delete="editorStore.removeComponent(index)"
        @resize="onResize(index, $event)"
      />
    </VueDraggable>

    <!-- Empty placeholder (also a drop target) -->
    <div
      v-else
      class="app-editor__placeholder"
      @dragover.prevent="onGridDragOver"
      @drop.prevent="onGridDrop"
    >
      <i class="pi pi-pencil" style="font-size: 2rem; color: #9ca3af" />
      <p>Перетащите компоненты из палитры</p>
      <p class="app-editor__subtitle">или добавьте их через чат</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useEditorStore } from '../../stores/editor'
import { gridItemStyle } from '../../utils/gridLayout'
import { snapToGrid } from '../../utils/editorDrag'
import { getDefaultComponent } from '../../utils/componentDefaults'
import EditorComponentCard from './EditorComponentCard.vue'
import type { UiComponent, PageConfig } from '../../stores/editor'

const editorStore = useEditorStore()

const components = computed({
  get: () => editorStore.currentPageComponents,
  set: (val: UiComponent[]) => {
    editorStore.replaceCurrentComponents(val)
  }
})

// Page management state
const showAddPageDialog = ref(false)
const newPage = reactive({ id: '', title: '', icon: '' })
const pageToRemove = ref<{ id: string; title: string } | null>(null)
const pageDragFrom = ref<number | null>(null)

const PAGE_ID_REGEX = /^[a-zA-Z0-9_-]{1,50}$/

const activePageData = computed(() => {
  if (!editorStore.editablePages || !editorStore.activePage) return null
  return editorStore.editablePages.find(p => p.id === editorStore.activePage) ?? null
})

const newPageIdError = computed(() => {
  if (!newPage.id) return ''
  if (!PAGE_ID_REGEX.test(newPage.id)) return 'Только буквы, цифры, дефис и подчёркивание (макс 50)'
  const existingIds = editorStore.editablePages?.map(p => p.id) ?? []
  if (existingIds.includes(newPage.id)) return 'Страница с таким ID уже существует'
  return ''
})

const canAddPage = computed(() => {
  return newPage.id.trim() !== '' && newPage.title.trim() !== '' && !newPageIdError.value
})

function handleAddPage() {
  if (!canAddPage.value) return

  // If single-page, convert to multi-page first
  if (!editorStore.isMultiPage) {
    editorStore.convertToMultiPage()
  }

  const page: PageConfig = {
    id: newPage.id.trim(),
    title: newPage.title.trim(),
    icon: newPage.icon.trim() || undefined,
    uiComponents: [],
  }
  editorStore.addPage(page)

  // Reset dialog
  newPage.id = ''
  newPage.title = ''
  newPage.icon = ''
  showAddPageDialog.value = false
}

function confirmRemovePage(pageId: string, title: string) {
  pageToRemove.value = { id: pageId, title }
}

function handleRemovePage() {
  if (!pageToRemove.value) return
  editorStore.removePage(pageToRemove.value.id)
  pageToRemove.value = null
}

function onPageTitleChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (editorStore.activePage && val.trim()) {
    editorStore.updatePage(editorStore.activePage, { title: val.trim() })
  }
}

function onPageIconChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  if (editorStore.activePage) {
    editorStore.updatePage(editorStore.activePage, { icon: val.trim() })
  }
}

// Tab drag-and-drop reordering
function onPageDragStart(idx: number, e: DragEvent) {
  pageDragFrom.value = idx
  e.dataTransfer?.setData('text/plain', String(idx))
}

function onPageDragOver(idx: number, e: DragEvent) {
  if (pageDragFrom.value !== null && pageDragFrom.value !== idx) {
    e.dataTransfer!.dropEffect = 'move'
  }
}

function onPageDrop(toIdx: number) {
  if (pageDragFrom.value !== null && pageDragFrom.value !== toIdx) {
    editorStore.reorderPages(pageDragFrom.value, toIdx)
  }
  pageDragFrom.value = null
}

function onDragUpdate(evt: { oldIndex: number; newIndex: number }) {
  // VueDraggable already mutated the array via v-model.
  // Update selection to follow the moved item if needed.
  if (editorStore.selectedComponentIndex === evt.oldIndex) {
    editorStore.selectComponent(evt.newIndex)
  } else if (editorStore.selectedComponentIndex !== null) {
    const sel = editorStore.selectedComponentIndex
    if (evt.oldIndex < sel && evt.newIndex >= sel) {
      editorStore.selectComponent(sel - 1)
    } else if (evt.oldIndex > sel && evt.newIndex <= sel) {
      editorStore.selectComponent(sel + 1)
    }
  }
}

function onGridDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/x-editor-component')) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onGridDrop(event: DragEvent) {
  const componentType = event.dataTransfer?.getData('application/x-editor-component')
  if (!componentType) return
  const component = getDefaultComponent(componentType)
  editorStore.addComponent(component)
}

function onResize(index: number, newColSpan: number) {
  const comp = editorStore.currentPageComponents[index]
  const currentLayout = comp?.layout || { col: 1, colSpan: 12 }
  const snapped = snapToGrid(currentLayout.col, newColSpan)
  editorStore.updateLayout(index, {
    ...currentLayout,
    colSpan: snapped.colSpan,
  })
}
</script>

<style scoped>
.app-editor {
  position: relative;
  min-height: 200px;
}

/* ── Page tabs ───────────────────────────────── */
.app-editor__page-tabs {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0 0.75rem;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 0.75rem;
}

.app-editor__page-tabs-list {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  flex: 1;
}

.app-editor__page-tab {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.35rem 0.5rem 0.35rem 0.75rem;
  font-size: 0.8rem;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  user-select: none;
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
  font-size: 0.75rem;
}

.app-editor__page-tab-title {
  flex: 1;
}

.app-editor__page-tab-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0.15rem;
  font-size: 0.65rem;
  color: inherit;
  opacity: 0.5;
  transition: opacity 0.15s;
  line-height: 1;
}

.app-editor__page-tab-close:hover {
  opacity: 1;
}

.app-editor__add-page-btn {
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 0.375rem;
  padding: 0.35rem 0.5rem;
  color: #9ca3af;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
  flex-shrink: 0;
}

.app-editor__add-page-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
  background: #eef2ff;
}

/* ── Page properties ─────────────────────────── */
.app-editor__page-props {
  display: flex;
  gap: 0.75rem;
  padding: 0 0 0.75rem;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.app-editor__page-prop {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.app-editor__page-prop-label {
  color: #9ca3af;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.app-editor__page-prop-value {
  color: #6b7280;
  font-family: monospace;
  font-size: 0.75rem;
  background: #f9fafb;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
}

.app-editor__page-prop-input {
  border: 1px solid #e5e7eb;
  border-radius: 0.25rem;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  color: #374151;
  background: #fff;
  width: 120px;
}

.app-editor__page-prop-input:focus {
  outline: none;
  border-color: #6366f1;
}

/* ── Dialogs ─────────────────────────────────── */
.app-editor__dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.app-editor__dialog {
  background: #fff;
  border-radius: 0.75rem;
  padding: 1.5rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.app-editor__dialog-title {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.app-editor__dialog-text {
  margin: 0 0 1rem;
  font-size: 0.95rem;
  color: #111827;
}

.app-editor__dialog-field {
  margin-bottom: 0.75rem;
}

.app-editor__dialog-field label {
  display: block;
  font-size: 0.8rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.app-editor__dialog-input {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
  color: #111827;
  box-sizing: border-box;
}

.app-editor__dialog-input:focus {
  outline: none;
  border-color: #6366f1;
}

.app-editor__dialog-error {
  display: block;
  font-size: 0.75rem;
  color: #ef4444;
  margin-top: 0.2rem;
}

.app-editor__dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

.app-editor__dialog-btn {
  border: none;
  border-radius: 0.375rem;
  padding: 0.4rem 0.85rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.app-editor__dialog-btn--cancel {
  background: none;
  color: #6b7280;
}

.app-editor__dialog-btn--cancel:hover {
  background: #f3f4f6;
}

.app-editor__dialog-btn--confirm {
  background: #6366f1;
  color: #fff;
}

.app-editor__dialog-btn--confirm:hover {
  background: #4f46e5;
}

.app-editor__dialog-btn--confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-editor__dialog-btn--danger {
  background: #ef4444;
  color: #fff;
}

.app-editor__dialog-btn--danger:hover {
  background: #dc2626;
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

/* ── Drag ghost ─────────────────────────────── */
.app-editor__ghost {
  opacity: 0.4;
  border: 2px dashed #6366f1 !important;
  background: #eef2ff !important;
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
