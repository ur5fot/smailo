<template>
  <div class="input-bar">
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
      class="input-bar__mic"
      :class="{ 'input-bar__mic--recording': isRecording }"
      :aria-label="isRecording ? 'Stop recording' : 'Start recording'"
      :disabled="!speechSupported"
      @click="toggleRecording"
    >
      <i class="pi pi-microphone" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'

const emit = defineEmits<{
  submit: [message: string]
}>()

const text = ref('')
const isRecording = ref(false)

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
const speechSupported = !!SpeechRecognition

let recognition: any = null

function handleSubmit() {
  const message = text.value.trim()
  if (!message) return
  emit('submit', message)
  text.value = ''
}

function toggleRecording() {
  if (isRecording.value) {
    recognition?.stop()
    return
  }

  recognition = new SpeechRecognition()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = 'en-US'

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
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #fff;
  border-top: 1px solid #e5e7eb;
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
