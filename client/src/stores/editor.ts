import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'
import type { LayoutMeta } from '../utils/gridLayout'

export interface UiComponent {
  component: string
  props: Record<string, unknown>
  layout?: LayoutMeta
  dataKey?: string
  dataSource?: { type: 'table'; tableId: number; filter?: unknown }
  computedValue?: string
  actions?: unknown[]
  fields?: unknown[]
  outputKey?: string
  showIf?: string
  styleIf?: unknown[]
  condition?: string
  children?: UiComponent[]
  [key: string]: unknown
}

export interface PageConfig {
  id: string
  title: string
  icon?: string
  uiComponents: UiComponent[]
}

export const useEditorStore = defineStore('editor', () => {
  const isEditMode = ref(false)
  const selectedComponentIndex = ref<number | null>(null)
  const editableConfig = ref<UiComponent[]>([])
  const editablePages = ref<PageConfig[] | null>(null)
  const isDirty = ref(false)
  const activePage = ref<string | null>(null)

  const selectedComponent = computed((): UiComponent | null => {
    if (selectedComponentIndex.value === null) return null
    const components = currentPageComponents.value
    return components[selectedComponentIndex.value] ?? null
  })

  const currentPageComponents = computed((): UiComponent[] => {
    if (editablePages.value && activePage.value) {
      const page = editablePages.value.find(p => p.id === activePage.value)
      return page?.uiComponents ?? []
    }
    return editableConfig.value
  })

  const isMultiPage = computed(() => editablePages.value !== null && editablePages.value.length > 0)

  function enterEditMode(config: Record<string, unknown>) {
    isEditMode.value = true
    isDirty.value = false
    selectedComponentIndex.value = null

    if (config.pages && Array.isArray(config.pages)) {
      editablePages.value = JSON.parse(JSON.stringify(config.pages))
      editableConfig.value = []
      activePage.value = (config.pages as PageConfig[])[0]?.id ?? null
    } else {
      editablePages.value = null
      editableConfig.value = JSON.parse(JSON.stringify(config.uiComponents || []))
      activePage.value = null
    }
  }

  function exitEditMode() {
    isEditMode.value = false
    isDirty.value = false
    selectedComponentIndex.value = null
    editableConfig.value = []
    editablePages.value = null
    activePage.value = null
  }

  function selectComponent(index: number | null) {
    selectedComponentIndex.value = index
  }

  function updateComponent(index: number, partial: Partial<UiComponent>) {
    const components = _getCurrentComponents()
    if (!components || index < 0 || index >= components.length) return
    components[index] = { ...components[index], ...partial }
    isDirty.value = true
  }

  function removeComponent(index: number) {
    const components = _getCurrentComponents()
    if (!components || index < 0 || index >= components.length) return
    components.splice(index, 1)
    if (selectedComponentIndex.value === index) {
      selectedComponentIndex.value = null
    } else if (selectedComponentIndex.value !== null && selectedComponentIndex.value > index) {
      selectedComponentIndex.value--
    }
    isDirty.value = true
  }

  function addComponent(component: UiComponent, index?: number) {
    const components = _getCurrentComponents()
    if (!components) return
    if (index !== undefined && index >= 0 && index <= components.length) {
      components.splice(index, 0, component)
    } else {
      components.push(component)
    }
    isDirty.value = true
  }

  function moveComponent(fromIndex: number, toIndex: number) {
    const components = _getCurrentComponents()
    if (!components) return
    if (fromIndex < 0 || fromIndex >= components.length) return
    if (toIndex < 0 || toIndex >= components.length) return
    if (fromIndex === toIndex) return

    const [item] = components.splice(fromIndex, 1)
    components.splice(toIndex, 0, item)

    // Update selection to follow the moved component
    if (selectedComponentIndex.value === fromIndex) {
      selectedComponentIndex.value = toIndex
    } else if (selectedComponentIndex.value !== null) {
      if (fromIndex < selectedComponentIndex.value && toIndex >= selectedComponentIndex.value) {
        selectedComponentIndex.value--
      } else if (fromIndex > selectedComponentIndex.value && toIndex <= selectedComponentIndex.value) {
        selectedComponentIndex.value++
      }
    }
    isDirty.value = true
  }

  function updateLayout(index: number, layout: LayoutMeta) {
    const components = _getCurrentComponents()
    if (!components || index < 0 || index >= components.length) return
    components[index] = { ...components[index], layout }
    isDirty.value = true
  }

  async function saveConfig(hash: string) {
    const body: Record<string, unknown> = {}
    if (editablePages.value) {
      body.pages = editablePages.value
    } else {
      body.uiComponents = editableConfig.value
    }
    const res = await api.put(`/app/${hash}/config`, body)
    isDirty.value = false
    return res.data
  }

  function setActivePage(pageId: string) {
    if (editablePages.value?.find(p => p.id === pageId)) {
      selectedComponentIndex.value = null
      activePage.value = pageId
    }
  }

  function discardChanges(config: Record<string, unknown>) {
    enterEditMode(config)
  }

  // Internal helper to get mutable reference to current page's components
  function _getCurrentComponents(): UiComponent[] | null {
    if (editablePages.value && activePage.value) {
      const page = editablePages.value.find(p => p.id === activePage.value)
      return page?.uiComponents ?? null
    }
    return editableConfig.value
  }

  return {
    // State
    isEditMode,
    selectedComponentIndex,
    editableConfig,
    editablePages,
    isDirty,
    activePage,
    // Getters
    selectedComponent,
    currentPageComponents,
    isMultiPage,
    // Actions
    enterEditMode,
    exitEditMode,
    selectComponent,
    updateComponent,
    removeComponent,
    addComponent,
    moveComponent,
    updateLayout,
    saveConfig,
    setActivePage,
    discardChanges,
  }
})
