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
import { useAppStore } from '../stores/app'
import { useUserStore } from '../stores/user'
import { executeActions, type ActionStep } from '../utils/actionExecutor'

const props = defineProps<{
  label: string
  severity?: string
  action?: { key: string; value?: unknown; mode?: string }
  actions?: ActionStep[]
  hash: string
  currentPageId?: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const appStore = useAppStore()
const userStore = useUserStore()
const loading = ref(false)
const errorMsg = ref('')

async function handleClick() {
  loading.value = true
  errorMsg.value = ''
  try {
    if (props.actions?.length) {
      await executeActions(props.actions, {
        hash: props.hash,
        userId: userStore.userId,
        currentPageId: props.currentPageId,
        appData: appStore.appData,
        appStore,
      })
    } else if (props.action) {
      const payload: Record<string, unknown> = {
        key: props.action.key,
        value: props.action.value !== undefined ? props.action.value : true,
      }
      if (props.action.mode) {
        payload.mode = props.action.mode
      }
      await api.post(`/app/${props.hash}/data`, payload)
    }
    emit('data-written')
  } catch {
    errorMsg.value = 'Не удалось сохранить. Попробуйте ещё раз.'
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
