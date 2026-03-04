<template>
  <div class="app-form">
    <div
      v-for="field in effectiveFields"
      :key="field.name"
      class="app-form__field"
    >
      <label class="app-form__label">
        {{ field.label }}
        <span v-if="field.required" class="app-form__required">*</span>
      </label>
      <InputNumber
        v-if="field.type === 'number'"
        v-model="fieldValues[field.name] as number | null"
        class="app-form__input"
      />
      <DatePicker
        v-else-if="field.type === 'date'"
        v-model="(fieldValues[field.name] as Date)"
        class="app-form__input"
        dateFormat="yy-mm-dd"
        showIcon
      />
      <Checkbox
        v-else-if="field.type === 'boolean'"
        v-model="fieldValues[field.name] as boolean"
        :binary="true"
      />
      <Select
        v-else-if="field.type === 'select'"
        v-model="fieldValues[field.name] as string | null"
        :options="field.options"
        class="app-form__input"
        placeholder="Выберите..."
      />
      <InputText
        v-else
        v-model="fieldValues[field.name] as string"
        class="app-form__input"
      />
    </div>
    <Button
      :label="submitLabel || 'Сохранить'"
      :loading="loading"
      @click="handleSubmit"
    />
    <span v-if="errorMsg" class="app-form__error">{{ errorMsg }}</span>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DatePicker from 'primevue/datepicker'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import api from '../api'
import { useAppStore } from '../stores/app'
import { useUserStore } from '../stores/user'
import { executeActions, type ActionStep } from '../utils/actionExecutor'

interface FormField {
  name: string
  type: string
  label: string
  required?: boolean
  options?: string[]
}

const props = defineProps<{
  fields?: Array<{ name: string; type: string; label: string }>
  outputKey?: string
  submitLabel?: string
  appendMode?: boolean
  hash: string
  dataSource?: { type: 'table'; tableId: number }
  actions?: ActionStep[]
  currentPageId?: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const appStore = useAppStore()
const userStore = useUserStore()

const isTableMode = computed(() => props.dataSource?.type === 'table')

// When dataSource is present, auto-generate fields from table schema columns
const effectiveFields = computed<FormField[]>(() => {
  if (isTableMode.value && props.dataSource) {
    const tableInfo = appStore.getTableData(props.dataSource.tableId)
    if (!tableInfo) return []
    // Skip formula columns — they are read-only, computed server-side
    return tableInfo.schema.columns
      .filter(col => col.type !== 'formula')
      .map(col => ({
        name: col.name,
        type: col.type,
        label: col.name,
        required: col.required,
        options: col.options,
      }))
  }
  return (props.fields || []).map(f => ({
    name: f.name,
    type: f.type,
    label: f.label,
  }))
})

function initDefaults(fields: FormField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map(f => {
    switch (f.type) {
      case 'number': return [f.name, null]
      case 'boolean': return [f.name, false]
      case 'date': return [f.name, null]
      case 'select': return [f.name, null]
      default: return [f.name, '']
    }
  }))
}

const fieldValues = reactive<Record<string, unknown>>(initDefaults(effectiveFields.value))
const loading = ref(false)
const errorMsg = ref('')

// Re-initialize fieldValues when effective fields change
watch(effectiveFields, (newFields) => {
  for (const key of Object.keys(fieldValues)) {
    delete fieldValues[key]
  }
  Object.assign(fieldValues, initDefaults(newFields))
  errorMsg.value = ''
})

async function handleSubmit() {
  const fields = effectiveFields.value
  // Validate required fields
  for (const field of fields) {
    const v = fieldValues[field.name]
    const isRequired = isTableMode.value ? field.required : true
    if (isRequired) {
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
        errorMsg.value = `"${field.label}" обязательно для заполнения.`
        return
      }
    }
  }
  loading.value = true
  errorMsg.value = ''
  try {
    if (isTableMode.value && props.dataSource) {
      // Table mode: POST row to tables API
      const data: Record<string, unknown> = {}
      for (const field of fields) {
        const v = fieldValues[field.name]
        if (field.type === 'date' && v instanceof Date) {
          data[field.name] = v.toISOString()
        } else if (v === '' || v === undefined) {
          data[field.name] = null
        } else {
          data[field.name] = v
        }
      }
      await api.post(`/app/${props.hash}/tables/${props.dataSource.tableId}/rows`, { data })
      appStore.invalidateTableCache(props.dataSource.tableId)
    } else {
      // KV mode: POST to appData
      const formObject: Record<string, unknown> = {}
      for (const field of fields) {
        formObject[field.name] = fieldValues[field.name]
      }
      formObject.timestamp = new Date().toISOString()
      await api.post(`/app/${props.hash}/data`, {
        key: props.outputKey,
        value: formObject,
        ...(props.appendMode ? { mode: 'append' } : {}),
      })
    }
    // Run post-submit action chain if defined
    if (props.actions?.length) {
      await executeActions(props.actions, {
        hash: props.hash,
        userId: userStore.userId,
        currentPageId: props.currentPageId,
        appData: appStore.appData,
        appStore,
      })
    }
    // Reset form
    Object.assign(fieldValues, initDefaults(fields))
    emit('data-written')
  } catch (e: any) {
    const serverError = e?.response?.data?.error
    errorMsg.value = serverError || 'Не удалось сохранить. Попробуйте ещё раз.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.app-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.app-form__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.app-form__label {
  font-size: 0.9rem;
  font-weight: 500;
}

.app-form__required {
  color: #ef4444;
}

.app-form__input {
  width: 100%;
}

.app-form__error {
  color: #ef4444;
  font-size: 0.8rem;
}
</style>
