import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  mood?: string
}

export interface AppConfig {
  appName: string
  description: string
  cronJobs: Array<{ name: string; schedule: string; humanReadable: string; action: string }>
  uiComponents: Array<{ component: string; dataKey?: string }>
}

function generateSessionId(): string {
  return Array.from({ length: 20 }, () => Math.random().toString(36)[2] || '0').join('')
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const sessionId = ref<string>(generateSessionId())
  const mood = ref<string>('idle')
  const phase = ref<string>('brainstorm')
  // Restore appHash and creationToken from sessionStorage so they survive a page refresh
  // during the window between app creation and setting a password.
  const appHash = ref<string | null>(sessionStorage.getItem('smailo_appHash'))
  const appConfig = ref<AppConfig | null>(null)
  // One-time token returned at app creation; required to call set-password
  const creationToken = ref<string | null>(sessionStorage.getItem('smailo_creationToken'))

  async function sendMessage(text: string, userId?: string) {
    messages.value.push({ role: 'user', content: text })
    mood.value = 'thinking'

    let res
    try {
      res = await api.post('/chat', {
        sessionId: sessionId.value,
        message: text,
        ...(userId ? { userId } : {}),
      })
    } catch (err) {
      // Remove the optimistically-pushed user message so it doesn't linger after failure.
      messages.value.pop()
      mood.value = 'confused'
      throw err
    }

    const data = res.data
    mood.value = data.mood || 'idle'
    phase.value = data.phase || phase.value

    if (data.appHash) {
      appHash.value = data.appHash
      sessionStorage.setItem('smailo_appHash', data.appHash)
    }
    if (data.creationToken) {
      creationToken.value = data.creationToken
      sessionStorage.setItem('smailo_creationToken', data.creationToken)
    }
    if (data.appConfig) {
      appConfig.value = data.appConfig
    }

    messages.value.push({
      role: 'assistant',
      content: data.message,
      mood: data.mood,
    })

    return data
  }

  function reset() {
    messages.value = []
    sessionId.value = generateSessionId()
    mood.value = 'idle'
    phase.value = 'brainstorm'
    appHash.value = null
    appConfig.value = null
    creationToken.value = null
    sessionStorage.removeItem('smailo_appHash')
    sessionStorage.removeItem('smailo_creationToken')
  }

  return { messages, sessionId, mood, phase, appHash, appConfig, creationToken, sendMessage, reset }
})
