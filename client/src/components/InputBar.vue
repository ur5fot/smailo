<template>
  <div class="input-bar">
    <!-- Quick number buttons (shown when last assistant message has a numbered list) -->
    <div v-if="showNumberButtons" class="input-bar__quick-numbers">
      <button
        v-for="n in detectedCount"
        :key="n"
        class="input-bar__number-btn"
        @click="sendNumber(n)"
      >
        {{ n }}
      </button>
    </div>

    <!-- Main input row -->
    <div class="input-bar__row">
      <InputText
        v-model="text"
        placeholder="Type a message..."
        class="input-bar__text"
        @keydown.enter="handleSubmit"
      />
      <Button
        icon="pi pi-send"
        class="input-bar__send"
        :disabled="!text.trim()"
        @click="handleSubmit"
      />
      <button
        v-if="speechSupported"
        class="input-bar__mic"
        :class="{ 'input-bar__mic--recording': isRecording }"
        :aria-label="isRecording ? 'Stop recording' : 'Start recording'"
        @click="toggleRecording"
      >
        <i class="pi pi-microphone" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const props = defineProps<{
  lastAssistantMessage?: string
}>()

const emit = defineEmits<{
  submit: [message: string]
}>()

const text = ref('')
const isRecording = ref(false)

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
const speechSupported = !!SpeechRecognition

let recognition: any = null

// Detect numbered list in last assistant message
const showNumberButtons = computed(() => {
  if (!props.lastAssistantMessage) return false
  return /^\d+\./m.test(props.lastAssistantMessage)
})

// Count how many numbered options are in the message (up to 5)
const detectedCount = computed(() => {
  if (!props.lastAssistantMessage) return 3
  const matches = props.lastAssistantMessage.match(/^\d+\./gm)
  if (!matches) return 3
  return Math.min(matches.length, 5)
})

function handleSubmit() {
  const message = text.value.trim()
  if (!message) return
  emit('submit', message)
  text.value = ''
}

function sendNumber(n: number) {
  emit('submit', String(n))
}

function toggleRecording() {
  if (isRecording.value) {
    recognition?.stop()
    return
  }

  recognition = new SpeechRecognition()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = 'ru-RU'

  recognition.onstart = () => {
    isRecording.value = true
  }

  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript
    text.value = transcript
  }

  recognition.onerror = () => {
    isRecording.value = false
  }

  recognition.onend = () => {
    isRecording.value = false
  }

  recognition.start()
}

onUnmounted(() => {
  recognition?.stop()
})
</script>

<style scoped>
.input-bar {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-top: 1px solid #e5e7eb;
}

.input-bar__quick-numbers {
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem 1rem 0.25rem;
  flex-wrap: wrap;
}

.input-bar__number-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.6rem;
  border: 1px solid #6366f1;
  border-radius: 0.5rem;
  background: transparent;
  color: #6366f1;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.input-bar__number-btn:hover {
  background: #6366f1;
  color: #fff;
}

.input-bar__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}

.input-bar__text {
  flex: 1;
}

.input-bar__mic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  border-radius: 50%;
  background: #f3f4f6;
  cursor: pointer;
  color: #6b7280;
  transition: background 0.2s, color 0.2s;
}

.input-bar__mic:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-bar__mic:not(:disabled):hover {
  background: #e5e7eb;
}

.input-bar__mic--recording {
  background: #ef4444 !important;
  color: #fff !important;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
}
</style>
