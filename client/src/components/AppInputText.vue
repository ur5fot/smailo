<template>
  <div class="app-input-text">
    <label v-if="label" class="app-input-text__label">{{ label }}</label>
    <div class="app-input-text__row">
      <InputNumber
        v-if="type === 'number'"
        v-model="numericValue"
        :placeholder="placeholder"
        :disabled="isViewer"
        class="app-input-text__input"
      />
      <DatePicker
        v-else-if="type === 'date'"
        v-model="dateValue"
        :placeholder="placeholder"
        :disabled="isViewer"
        dateFormat="dd.mm.yy"
        class="app-input-text__input"
      />
      <InputText
        v-else
        v-model="textValue"
        :placeholder="placeholder"
        :disabled="isViewer"
        class="app-input-text__input"
      />
      <Button
        label="Сохранить"
        :loading="loading"
        :disabled="isViewer"
        @click="handleSave"
      />
    </div>
    <span v-if="errorMsg" class="app-input-text__error">{{ errorMsg }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import DatePicker from 'primevue/datepicker'
import api from '../api'
import { useAppStore } from '../stores/app'
import { useUserStore } from '../stores/user'
import { executeActions, type ActionStep } from '../utils/actionExecutor'

const props = defineProps<{
  label?: string
  type?: 'text' | 'number' | 'date'
  placeholder?: string
  action?: { key: string; mode?: 'append' }
  actions?: ActionStep[]
  hash: string
  currentPageId?: string
}>()

const emit = defineEmits<{
  'data-written': []
}>()

const appStore = useAppStore()
const userStore = useUserStore()
const isViewer = computed(() => appStore.myRole === 'viewer')

const numericValue = ref<number | null>(null)
const textValue = ref('')
const dateValue = ref<Date | null>(null)
const loading = ref(false)
const errorMsg = ref('')

function getInputValue(): unknown {
  if (props.type === 'number') return numericValue.value
  if (props.type === 'date') return dateValue.value ? (dateValue.value as Date).toISOString() : null
  return textValue.value
}

function clearInputs() {
  numericValue.value = null
  textValue.value = ''
  dateValue.value = null
}

async function handleSave() {
  const value = getInputValue()
  if (value === null || (typeof value === 'string' && value.trim() === '')) {
    errorMsg.value = 'Введите значение.'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    if (props.actions?.length) {
      // executeActions already calls fetchData internally — no need to emit 'data-written'
      await executeActions(props.actions, {
        hash: props.hash,
        userId: userStore.userId,
        currentPageId: props.currentPageId,
        appData: appStore.appData,
        appStore,
        inputValue: value,
      })
    } else if (props.action) {
      await api.post(`/app/${props.hash}/data`, {
        key: props.action.key,
        value,
        ...(props.action.mode === 'append' ? { mode: 'append' } : {}),
      })
      emit('data-written')
    }
    clearInputs()
  } catch {
    errorMsg.value = 'Не удалось сохранить. Попробуйте ещё раз.'
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
