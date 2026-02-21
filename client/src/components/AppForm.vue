<template>
  <div class="app-form">
    <div
      v-for="field in fields"
      :key="field.name"
      class="app-form__field"
    >
      <label class="app-form__label">{{ field.label }}</label>
      <InputNumber
        v-if="field.type === 'number'"
        v-model="fieldValues[field.name] as number | null"
        class="app-form__input"
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
import { reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import api from '../api'

const props = defineProps<{
  fields: Array<{ name: string; type: string; label: string }>
  outputKey: string
  submitLabel?: string
  hash: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const fieldValues = reactive<Record<string, string | number | null>>(
  Object.fromEntries(props.fields.map(f => [f.name, null]))
)
const loading = ref(false)
const errorMsg = ref('')

// Re-initialize fieldValues when fields prop changes (e.g. after a uiUpdate from chat)
watch(() => props.fields, (newFields) => {
  for (const key of Object.keys(fieldValues)) {
    delete fieldValues[key]
  }
  for (const f of newFields) {
    fieldValues[f.name] = null
  }
}, { deep: true })

async function handleSubmit() {
  // Validate: all fields must be non-null and non-empty before submitting
  for (const field of props.fields) {
    const v = fieldValues[field.name]
    if (v === null || v === '') {
      errorMsg.value = `"${field.label}" is required.`
      return
    }
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const formObject: Record<string, unknown> = { timestamp: new Date().toISOString() }
    for (const field of props.fields) {
      formObject[field.name] = fieldValues[field.name]
    }
    await api.post(`/app/${props.hash}/data`, {
      key: props.outputKey,
      value: formObject,
    })
    for (const field of props.fields) {
      fieldValues[field.name] = null
    }
    emit('data-written')
  } catch {
    errorMsg.value = 'Failed to save. Please try again.'
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

.app-form__input {
  width: 100%;
}

.app-form__error {
  color: #ef4444;
  font-size: 0.8rem;
}
</style>
