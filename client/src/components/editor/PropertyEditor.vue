<template>
  <div class="property-editor" v-if="component">
    <!-- General Section -->
    <div class="pe-section">
      <div class="pe-section__header" @click="toggleSection('general')">
        <i class="pi pi-cog pe-section__icon" />
        <span>General</span>
        <i :class="openSections.general ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="pe-section__chevron" />
      </div>
      <div v-show="openSections.general" class="pe-section__body">
        <div class="pe-field">
          <label class="pe-field__label">Тип</label>
          <div class="pe-field__value pe-field__value--readonly">{{ component.component }}</div>
        </div>
        <button class="pe-delete-btn" @click="handleDelete">
          <i class="pi pi-trash" />
          Удалить компонент
        </button>
      </div>
    </div>

    <!-- Props Section -->
    <div class="pe-section">
      <div class="pe-section__header" @click="toggleSection('props')">
        <i class="pi pi-sliders-h pe-section__icon" />
        <span>Props</span>
        <i :class="openSections.props ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="pe-section__chevron" />
      </div>
      <div v-show="openSections.props" class="pe-section__body">
        <div v-if="!propEntries.length" class="pe-empty">Нет свойств</div>
        <div v-for="entry in propEntries" :key="entry.key" class="pe-field">
          <label class="pe-field__label">{{ entry.key }}</label>
          <!-- Boolean -->
          <input
            v-if="entry.type === 'boolean'"
            type="checkbox"
            :checked="entry.value as boolean"
            class="pe-field__checkbox"
            @change="updateProp(entry.key, ($event.target as HTMLInputElement).checked)"
          />
          <!-- Number -->
          <input
            v-else-if="entry.type === 'number'"
            type="number"
            :value="entry.value as number"
            class="pe-field__input"
            @change="updateProp(entry.key, Number(($event.target as HTMLInputElement).value))"
          />
          <!-- String / default -->
          <input
            v-else
            type="text"
            :value="entry.value as string"
            class="pe-field__input"
            @change="updateProp(entry.key, ($event.target as HTMLInputElement).value)"
          />
        </div>
        <!-- Add new prop -->
        <div class="pe-add-row">
          <input
            v-model="newPropKey"
            type="text"
            placeholder="Новое свойство"
            class="pe-field__input pe-field__input--small"
            @keydown.enter="addNewProp"
          />
          <button class="pe-add-btn" @click="addNewProp" :disabled="!newPropKey.trim()">
            <i class="pi pi-plus" />
          </button>
        </div>
      </div>
    </div>

    <!-- Data Section -->
    <div class="pe-section">
      <div class="pe-section__header" @click="toggleSection('data')">
        <i class="pi pi-database pe-section__icon" />
        <span>Data</span>
        <i :class="openSections.data ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="pe-section__chevron" />
      </div>
      <div v-show="openSections.data" class="pe-section__body">
        <div class="pe-field">
          <label class="pe-field__label">dataKey</label>
          <input
            type="text"
            :value="component.dataKey || ''"
            class="pe-field__input"
            placeholder="Ключ в appData"
            @change="updateField('dataKey', ($event.target as HTMLInputElement).value || undefined)"
          />
        </div>
        <div class="pe-field">
          <label class="pe-field__label">computedValue</label>
          <input
            type="text"
            :value="component.computedValue || ''"
            class="pe-field__input"
            placeholder="= SUM(table.col)"
            @change="updateField('computedValue', ($event.target as HTMLInputElement).value || undefined)"
          />
        </div>
        <div class="pe-field">
          <label class="pe-field__label">dataSource</label>
          <select
            class="pe-field__select"
            :value="component.dataSource?.tableId ?? ''"
            @change="updateDataSource(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Нет</option>
            <option v-for="t in tables" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div class="pe-field" v-if="component.outputKey !== undefined || isFormOrInput">
          <label class="pe-field__label">outputKey</label>
          <input
            type="text"
            :value="component.outputKey || ''"
            class="pe-field__input"
            placeholder="Ключ для записи"
            @change="updateField('outputKey', ($event.target as HTMLInputElement).value || undefined)"
          />
        </div>
      </div>
    </div>

    <!-- Actions Section -->
    <div class="pe-section" v-if="supportsActions">
      <div class="pe-section__header" @click="toggleSection('actions')">
        <i class="pi pi-bolt pe-section__icon" />
        <span>Actions</span>
        <i :class="openSections.actions ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="pe-section__chevron" />
      </div>
      <div v-show="openSections.actions" class="pe-section__body">
        <div v-if="!currentActions.length" class="pe-empty">Нет действий</div>
        <div v-for="(action, ai) in currentActions" :key="ai" class="pe-action">
          <div class="pe-action__header">
            <select
              class="pe-field__select pe-field__select--small"
              :value="action.type"
              @change="updateActionType(ai, ($event.target as HTMLSelectElement).value)"
            >
              <option value="writeData">writeData</option>
              <option value="navigateTo">navigateTo</option>
              <option value="toggleVisibility">toggleVisibility</option>
              <option value="runFormula">runFormula</option>
              <option value="fetchUrl">fetchUrl</option>
            </select>
            <button class="pe-remove-btn" @click="removeAction(ai)" title="Удалить действие">
              <i class="pi pi-times" />
            </button>
          </div>
          <!-- writeData fields -->
          <template v-if="action.type === 'writeData'">
            <div class="pe-field">
              <label class="pe-field__label">key</label>
              <input type="text" :value="(action as any).key || ''" class="pe-field__input" @change="updateActionField(ai, 'key', ($event.target as HTMLInputElement).value)" />
            </div>
            <div class="pe-field">
              <label class="pe-field__label">value</label>
              <input type="text" :value="actionValueStr(action)" class="pe-field__input" @change="updateActionField(ai, 'value', parseActionValue(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="pe-field">
              <label class="pe-field__label">mode</label>
              <select class="pe-field__select" :value="(action as any).mode || ''" @change="updateActionField(ai, 'mode', ($event.target as HTMLSelectElement).value || undefined)">
                <option value="">По умолчанию</option>
                <option value="append">append</option>
                <option value="increment">increment</option>
                <option value="delete-item">delete-item</option>
              </select>
            </div>
          </template>
          <!-- navigateTo fields -->
          <template v-if="action.type === 'navigateTo'">
            <div class="pe-field">
              <label class="pe-field__label">pageId</label>
              <input type="text" :value="(action as any).pageId || ''" class="pe-field__input" @change="updateActionField(ai, 'pageId', ($event.target as HTMLInputElement).value)" />
            </div>
          </template>
          <!-- toggleVisibility fields -->
          <template v-if="action.type === 'toggleVisibility'">
            <div class="pe-field">
              <label class="pe-field__label">key</label>
              <input type="text" :value="(action as any).key || ''" class="pe-field__input" @change="updateActionField(ai, 'key', ($event.target as HTMLInputElement).value)" />
            </div>
          </template>
          <!-- runFormula fields -->
          <template v-if="action.type === 'runFormula'">
            <div class="pe-field">
              <label class="pe-field__label">formula</label>
              <input type="text" :value="(action as any).formula || ''" class="pe-field__input" @change="updateActionField(ai, 'formula', ($event.target as HTMLInputElement).value)" />
            </div>
            <div class="pe-field">
              <label class="pe-field__label">outputKey</label>
              <input type="text" :value="(action as any).outputKey || ''" class="pe-field__input" @change="updateActionField(ai, 'outputKey', ($event.target as HTMLInputElement).value)" />
            </div>
          </template>
          <!-- fetchUrl fields -->
          <template v-if="action.type === 'fetchUrl'">
            <div class="pe-field">
              <label class="pe-field__label">url</label>
              <input type="text" :value="(action as any).url || ''" class="pe-field__input" @change="updateActionField(ai, 'url', ($event.target as HTMLInputElement).value)" />
            </div>
            <div class="pe-field">
              <label class="pe-field__label">outputKey</label>
              <input type="text" :value="(action as any).outputKey || ''" class="pe-field__input" @change="updateActionField(ai, 'outputKey', ($event.target as HTMLInputElement).value)" />
            </div>
            <div class="pe-field">
              <label class="pe-field__label">dataPath</label>
              <input type="text" :value="(action as any).dataPath || ''" class="pe-field__input" @change="updateActionField(ai, 'dataPath', ($event.target as HTMLInputElement).value || undefined)" />
            </div>
          </template>
        </div>
        <button v-if="currentActions.length < 5" class="pe-add-action-btn" @click="addAction">
          <i class="pi pi-plus" /> Добавить действие
        </button>
      </div>
    </div>

    <!-- Conditional Section -->
    <div class="pe-section">
      <div class="pe-section__header" @click="toggleSection('conditional')">
        <i class="pi pi-eye pe-section__icon" />
        <span>Conditional</span>
        <i :class="openSections.conditional ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="pe-section__chevron" />
      </div>
      <div v-show="openSections.conditional" class="pe-section__body">
        <div class="pe-field">
          <label class="pe-field__label">showIf</label>
          <input
            type="text"
            :value="component.showIf || ''"
            class="pe-field__input"
            placeholder='status == "active"'
            @change="updateField('showIf', ($event.target as HTMLInputElement).value || undefined)"
          />
        </div>
        <div class="pe-field">
          <label class="pe-field__label">styleIf</label>
        </div>
        <div v-for="(rule, si) in currentStyleIf" :key="si" class="pe-stylif-row">
          <input
            type="text"
            :value="rule.condition"
            class="pe-field__input pe-field__input--small"
            placeholder="condition"
            @change="updateStyleIfCondition(si, ($event.target as HTMLInputElement).value)"
          />
          <select
            class="pe-field__select pe-field__select--small"
            :value="rule.class"
            @change="updateStyleIfClass(si, ($event.target as HTMLSelectElement).value)"
          >
            <option value="warning">warning</option>
            <option value="critical">critical</option>
            <option value="success">success</option>
            <option value="muted">muted</option>
            <option value="highlight">highlight</option>
          </select>
          <button class="pe-remove-btn" @click="removeStyleIf(si)">
            <i class="pi pi-times" />
          </button>
        </div>
        <button class="pe-add-action-btn" @click="addStyleIf">
          <i class="pi pi-plus" /> Добавить условие стиля
        </button>
      </div>
    </div>

    <!-- Layout Section -->
    <div class="pe-section">
      <div class="pe-section__header" @click="toggleSection('layout')">
        <i class="pi pi-th-large pe-section__icon" />
        <span>Layout</span>
        <i :class="openSections.layout ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" class="pe-section__chevron" />
      </div>
      <div v-show="openSections.layout" class="pe-section__body">
        <div class="pe-field pe-field--inline">
          <label class="pe-field__label">col</label>
          <input
            type="number"
            :value="component.layout?.col ?? 1"
            min="1" max="12"
            class="pe-field__input pe-field__input--num"
            @change="updateLayoutField('col', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div class="pe-field pe-field--inline">
          <label class="pe-field__label">colSpan</label>
          <input
            type="number"
            :value="component.layout?.colSpan ?? 12"
            min="1" max="12"
            class="pe-field__input pe-field__input--num"
            @change="updateLayoutField('colSpan', Number(($event.target as HTMLInputElement).value))"
          />
        </div>
        <div class="pe-field pe-field--inline">
          <label class="pe-field__label">row</label>
          <input
            type="number"
            :value="component.layout?.row ?? ''"
            min="1"
            class="pe-field__input pe-field__input--num"
            placeholder="auto"
            @change="updateLayoutField('row', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
          />
        </div>
        <div class="pe-field pe-field--inline">
          <label class="pe-field__label">rowSpan</label>
          <input
            type="number"
            :value="component.layout?.rowSpan ?? ''"
            min="1"
            class="pe-field__input pe-field__input--num"
            placeholder="1"
            @change="updateLayoutField('rowSpan', ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : undefined)"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- No selection placeholder -->
  <div v-else class="property-editor property-editor--empty">
    <i class="pi pi-sliders-h" style="font-size: 1.5rem; color: #9ca3af" />
    <p>Свойства компонента</p>
    <p class="pe-subtitle">Выберите компонент на canvas</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, inject, type Ref } from 'vue'
import { useEditorStore, type UiComponent } from '../../stores/editor'

const editorStore = useEditorStore()

// Tables injected from AppView via provide/inject (computed ref)
const tablesRef = inject<Ref<{ id: number; name: string }[]>>('editorTables', ref([]))
const tables = computed(() => tablesRef.value)

const component = computed(() => editorStore.selectedComponent)
const selectedIndex = computed(() => editorStore.selectedComponentIndex)

const openSections = reactive({
  general: true,
  props: true,
  data: false,
  actions: false,
  conditional: false,
  layout: false,
})

const newPropKey = ref('')

function toggleSection(key: keyof typeof openSections) {
  openSections[key] = !openSections[key]
}

// Props section helpers
const propEntries = computed(() => {
  if (!component.value?.props) return []
  return Object.entries(component.value.props).map(([key, value]) => ({
    key,
    value,
    type: typeof value,
  }))
})

function updateProp(key: string, value: unknown) {
  if (selectedIndex.value === null || !component.value) return
  const newProps = { ...component.value.props, [key]: value }
  editorStore.updateComponent(selectedIndex.value, { props: newProps })
}

function addNewProp() {
  const key = newPropKey.value.trim()
  if (!key || selectedIndex.value === null || !component.value) return
  const newProps = { ...component.value.props, [key]: '' }
  editorStore.updateComponent(selectedIndex.value, { props: newProps })
  newPropKey.value = ''
}

// Data section
const isFormOrInput = computed(() => {
  const t = component.value?.component
  return t === 'Form' || t === 'InputText' || t === 'Button'
})

function updateField(field: string, value: unknown) {
  if (selectedIndex.value === null) return
  editorStore.updateComponent(selectedIndex.value, { [field]: value })
}

function updateDataSource(tableIdStr: string) {
  if (selectedIndex.value === null) return
  if (!tableIdStr) {
    editorStore.updateComponent(selectedIndex.value, { dataSource: undefined })
  } else {
    editorStore.updateComponent(selectedIndex.value, {
      dataSource: { type: 'table' as const, tableId: Number(tableIdStr) },
    })
  }
}

// Actions section
const supportsActions = computed(() => {
  const t = component.value?.component
  return t === 'Button' || t === 'InputText' || t === 'Form'
})

const currentActions = computed((): Record<string, unknown>[] => {
  return (component.value?.actions as Record<string, unknown>[]) || []
})

function addAction() {
  if (selectedIndex.value === null || !component.value) return
  const actions = [...currentActions.value, { type: 'writeData', key: '' }]
  editorStore.updateComponent(selectedIndex.value, { actions })
}

function removeAction(index: number) {
  if (selectedIndex.value === null || !component.value) return
  const actions = currentActions.value.filter((_, i) => i !== index)
  editorStore.updateComponent(selectedIndex.value, { actions })
}

function updateActionType(index: number, newType: string) {
  if (selectedIndex.value === null) return
  const actions = [...currentActions.value]
  // Reset to minimal shape for the new type
  const defaults: Record<string, Record<string, unknown>> = {
    writeData: { type: 'writeData', key: '' },
    navigateTo: { type: 'navigateTo', pageId: '' },
    toggleVisibility: { type: 'toggleVisibility', key: '' },
    runFormula: { type: 'runFormula', formula: '', outputKey: '' },
    fetchUrl: { type: 'fetchUrl', url: '', outputKey: '' },
  }
  actions[index] = defaults[newType] || { type: newType }
  editorStore.updateComponent(selectedIndex.value, { actions })
}

function updateActionField(actionIndex: number, field: string, value: unknown) {
  if (selectedIndex.value === null) return
  const actions = [...currentActions.value]
  actions[actionIndex] = { ...actions[actionIndex], [field]: value }
  editorStore.updateComponent(selectedIndex.value, { actions })
}

function actionValueStr(action: Record<string, unknown>): string {
  const v = (action as any).value
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function parseActionValue(str: string): unknown {
  if (str === '') return undefined
  if (str === 'true') return true
  if (str === 'false') return false
  const num = Number(str)
  if (!isNaN(num) && str.trim() !== '') return num
  try { return JSON.parse(str) } catch { return str }
}

// Conditional section
const currentStyleIf = computed((): { condition: string; class: string }[] => {
  return (component.value?.styleIf as { condition: string; class: string }[]) || []
})

function addStyleIf() {
  if (selectedIndex.value === null) return
  const styleIf = [...currentStyleIf.value, { condition: '', class: 'warning' }]
  editorStore.updateComponent(selectedIndex.value, { styleIf })
}

function removeStyleIf(index: number) {
  if (selectedIndex.value === null) return
  const styleIf = currentStyleIf.value.filter((_, i) => i !== index)
  editorStore.updateComponent(selectedIndex.value, { styleIf })
}

function updateStyleIfCondition(index: number, condition: string) {
  if (selectedIndex.value === null) return
  const styleIf = [...currentStyleIf.value]
  styleIf[index] = { ...styleIf[index], condition }
  editorStore.updateComponent(selectedIndex.value, { styleIf })
}

function updateStyleIfClass(index: number, cls: string) {
  if (selectedIndex.value === null) return
  const styleIf = [...currentStyleIf.value]
  styleIf[index] = { ...styleIf[index], class: cls }
  editorStore.updateComponent(selectedIndex.value, { styleIf })
}

// Layout section
function updateLayoutField(field: string, value: number | undefined) {
  if (selectedIndex.value === null || !component.value) return
  const currentLayout = component.value.layout || { col: 1, colSpan: 12 }
  const newLayout = { ...currentLayout, [field]: value }
  // Remove undefined fields
  if (newLayout.row === undefined) delete newLayout.row
  if (newLayout.rowSpan === undefined) delete newLayout.rowSpan
  editorStore.updateLayout(selectedIndex.value, newLayout)
}

function handleDelete() {
  if (selectedIndex.value === null) return
  editorStore.removeComponent(selectedIndex.value)
}
</script>

<style scoped>
.property-editor {
  padding: 0;
  font-size: 0.85rem;
}

.property-editor--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #6b7280;
  text-align: center;
  padding: 2rem 1rem;
  flex: 1;
}

.property-editor--empty p {
  margin: 0;
}

.pe-subtitle {
  font-size: 0.8rem;
  color: #9ca3af;
}

/* Sections */
.pe-section {
  border-bottom: 1px solid #f3f4f6;
}

.pe-section__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.8rem;
  color: #374151;
  user-select: none;
}

.pe-section__header:hover {
  background: #f9fafb;
}

.pe-section__icon {
  font-size: 0.85rem;
  color: #6b7280;
  width: 1rem;
  text-align: center;
}

.pe-section__chevron {
  margin-left: auto;
  font-size: 0.7rem;
  color: #9ca3af;
}

.pe-section__body {
  padding: 0.25rem 0.75rem 0.75rem;
}

/* Fields */
.pe-field {
  margin-bottom: 0.5rem;
}

.pe-field--inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pe-field--inline .pe-field__label {
  min-width: 4rem;
  margin-bottom: 0;
}

.pe-field__label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 0.2rem;
}

.pe-field__value--readonly {
  font-size: 0.85rem;
  color: #111827;
  background: #f3f4f6;
  padding: 0.35rem 0.5rem;
  border-radius: 0.375rem;
}

.pe-field__input {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  color: #111827;
  background: #fff;
  outline: none;
  box-sizing: border-box;
}

.pe-field__input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

.pe-field__input--small {
  flex: 1;
  min-width: 0;
}

.pe-field__input--num {
  width: 5rem;
  flex: none;
}

.pe-field__select {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  color: #111827;
  background: #fff;
  outline: none;
  box-sizing: border-box;
}

.pe-field__select:focus {
  border-color: #6366f1;
}

.pe-field__select--small {
  flex: 1;
  min-width: 0;
}

.pe-field__checkbox {
  width: 1rem;
  height: 1rem;
  cursor: pointer;
}

/* Delete button */
.pe-delete-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  background: none;
  border: 1px solid #fca5a5;
  border-radius: 0.375rem;
  color: #dc2626;
  font-size: 0.8rem;
  cursor: pointer;
  width: 100%;
  justify-content: center;
  margin-top: 0.5rem;
}

.pe-delete-btn:hover {
  background: #fef2f2;
}

/* Actions */
.pe-action {
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  background: #fafafa;
}

.pe-action__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.pe-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: none;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

.pe-remove-btn:hover {
  color: #ef4444;
  background: #fef2f2;
}

.pe-add-action-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.6rem;
  background: none;
  border: 1px dashed #d1d5db;
  border-radius: 0.375rem;
  color: #6b7280;
  font-size: 0.8rem;
  cursor: pointer;
  width: 100%;
  justify-content: center;
}

.pe-add-action-btn:hover {
  border-color: #6366f1;
  color: #6366f1;
}

.pe-add-row {
  display: flex;
  gap: 0.3rem;
  align-items: center;
}

.pe-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
}

.pe-add-btn:hover:not(:disabled) {
  border-color: #6366f1;
  color: #6366f1;
}

.pe-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* StyleIf row */
.pe-stylif-row {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  margin-bottom: 0.4rem;
}

.pe-empty {
  color: #9ca3af;
  font-size: 0.8rem;
  font-style: italic;
  margin-bottom: 0.5rem;
}
</style>
