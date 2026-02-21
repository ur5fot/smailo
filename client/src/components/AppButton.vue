<template>
  <div class="app-button">
    <Button
      :label="label"
      :severity="severity"
      :loading="loading"
      @click="handleClick"
    />
    <span v-if="errorMsg" class="app-button__error">{{ errorMsg }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import api from '../api'

const props = defineProps<{
  label: string
  severity?: string
  action: { key: string; value?: unknown }
  hash: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const loading = ref(false)
const errorMsg = ref('')

async function handleClick() {
  loading.value = true
  errorMsg.value = ''
  try {
    await api.post(`/app/${props.hash}/data`, {
      key: props.action.key,
      value: props.action.value,
    })
    emit('data-written')
  } catch {
    errorMsg.value = 'Failed to save. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.app-button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

.app-button__error {
  color: #ef4444;
  font-size: 0.8rem;
}
</style>
