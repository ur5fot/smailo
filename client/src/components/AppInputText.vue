<template>
  <div class="app-input-text">
    <label v-if="label" class="app-input-text__label">{{ label }}</label>
    <div class="app-input-text__row">
      <InputNumber
        v-if="type === 'number'"
        v-model="numericValue"
        :placeholder="placeholder"
        class="app-input-text__input"
      />
      <InputText
        v-else
        v-model="textValue"
        :placeholder="placeholder"
        class="app-input-text__input"
      />
      <Button
        label="Сохранить"
        :loading="loading"
        @click="handleSave"
      />
    </div>
    <span v-if="errorMsg" class="app-input-text__error">{{ errorMsg }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import api from '../api'

const props = defineProps<{
  label?: string
  type?: 'text' | 'number'
  placeholder?: string
  action: { key: string }
  hash: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const numericValue = ref<number | null>(null)
const textValue = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function handleSave() {
  const value = props.type === 'number' ? numericValue.value : textValue.value
  if (value === null || (typeof value === 'string' && value.trim() === '')) return
  loading.value = true
  errorMsg.value = ''
  try {
    await api.post(`/app/${props.hash}/data`, {
      key: props.action.key,
      value,
    })
    numericValue.value = null
    textValue.value = ''
    emit('data-written')
  } catch {
    errorMsg.value = 'Failed to save. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.app-input-text {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.app-input-text__label {
  font-size: 0.9rem;
  font-weight: 500;
}

.app-input-text__row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.app-input-text__input {
  flex: 1;
}

.app-input-text__error {
  color: #ef4444;
  font-size: 0.8rem;
}
</style>
