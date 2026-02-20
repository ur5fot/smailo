import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  mood?: string
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const sessionId = ref<string>('')
  const mood = ref<string>('idle')
  const phase = ref<string>('brainstorm')
  const appHash = ref<string | null>(null)

  async function sendMessage(text: string) {
    messages.value.push({ role: 'user', content: text })
    mood.value = 'thinking'

    const res = await api.post('/chat', {
      sessionId: sessionId.value,
      message: text,
      appHash: appHash.value,
    })

    const data = res.data
    mood.value = data.mood || 'idle'
    phase.value = data.phase || phase.value

    if (data.appHash) {
      appHash.value = data.appHash
    }

    messages.value.push({
      role: 'assistant',
      content: data.message,
      mood: data.mood,
    })

    return data
  }

  return { messages, sessionId, mood, phase, appHash, sendMessage }
})
