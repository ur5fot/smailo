<template>
  <div class="app-view">
    <!-- Loading -->
    <div v-if="loading" class="app-view__loading">
      <Smailo mood="thinking" :size="80" />
      <p>Loading your app…</p>
    </div>

    <!-- Load error -->
    <div v-else-if="loadError" class="app-view__loading">
      <Smailo mood="confused" :size="80" />
      <p>{{ loadError }}</p>
    </div>

    <!-- Password form -->
    <div v-else-if="requiresAuth" class="app-view__auth">
      <Smailo :mood="authMood" :size="100" />
      <h2 class="app-view__auth-title">This app is protected</h2>
      <form class="app-view__auth-form" @submit.prevent="handleAuth">
        <Password
          v-model="password"
          placeholder="Enter password"
          :feedback="false"
          toggle-mask
          class="app-view__password-input"
          input-class="app-view__password-field"
          @keydown.enter="handleAuth"
        />
        <Button
          label="Unlock"
          icon="pi pi-lock-open"
          type="submit"
          :loading="authLoading"
          :disabled="!password.trim()"
        />
      </form>
      <p v-if="authError" class="app-view__auth-error">{{ authError }}</p>
    </div>

    <!-- Main app layout: two-column -->
    <template v-else>
      <!-- Two-column container -->
      <div class="app-view__columns">
        <!-- Left column: app content -->
        <div class="app-view__left">
          <!-- Header -->
          <header class="app-view__header">
            <div class="app-view__header-left">
              <router-link v-if="userId" :to="`/${userId}`" class="app-view__back">
                <i class="pi pi-arrow-left" />
              </router-link>
              <h1 class="app-view__title">{{ appStore.appName || 'My App' }}</h1>
            </div>
            <Button
              icon="pi pi-refresh"
              text
              rounded
              :loading="refreshing"
              title="Refresh data"
              class="app-view__refresh-btn"
              @click="handleRefresh"
            />
          </header>

          <!-- Scrollable app content -->
          <div class="app-view__content">
            <AppRenderer
              v-if="uiComponents.length > 0"
              :ui-config="uiComponents"
              :app-data="appDataMap"
              :hash="hash"
              class="app-view__renderer"
              @data-written="handleDataWritten"
            />
          </div>
        </div>

        <!-- Right column: Smailo + chat -->
        <div class="app-view__right">
          <div class="app-view__smailo-wrap">
            <Smailo :mood="smailoMood" :size="80" />
          </div>

          <!-- Chat messages -->
          <div class="app-view__messages" ref="messagesRef">
            <div v-if="chatMessages.length === 0" class="app-view__welcome">
              <p>Привет! Могу помочь изменить приложение.</p>
            </div>

            <div
              v-for="(msg, i) in chatMessages"
              :key="i"
              class="app-view__bubble-row"
              :class="msg.role === 'user' ? 'app-view__bubble-row--user' : 'app-view__bubble-row--assistant'"
            >
              <div
                v-if="msg.role === 'assistant'"
                class="app-view__bubble"
                v-html="renderMd(msg.content)"
              />
              <div v-else class="app-view__bubble">{{ msg.content }}</div>
            </div>

            <!-- Typing indicator -->
            <div v-if="chatLoading" class="app-view__bubble-row app-view__bubble-row--assistant">
              <div class="app-view__bubble app-view__bubble--typing">
                <span class="app-view__dot" />
                <span class="app-view__dot" />
                <span class="app-view__dot" />
              </div>
            </div>
          </div>

          <!-- Input bar -->
          <div class="app-view__input-wrapper">
            <InputBar :last-assistant-message="lastAssistantMessage" :disabled="chatLoading" @submit="handleChatSubmit" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Smailo from '../components/Smailo.vue'
import InputBar from '../components/InputBar.vue'
import AppRenderer from '../components/AppRenderer.vue'
import { useAppStore } from '../stores/app'
import type { ChatMessage } from '../stores/chat'
import { renderMd } from '../utils/markdown'
import type { Mood } from '../types'
import api from '../api'

const route = useRoute()
const appStore = useAppStore()
const hash = computed(() => route.params.hash as string)
const userId = computed(() => route.params.userId as string | undefined)

const loading = ref(true)
const loadError = ref('')
const requiresAuth = ref(false)
const password = ref('')
const authLoading = ref(false)
const authError = ref('')
const authMood = ref<Mood>('idle')
const smailoMood = ref<Mood>('idle')
const refreshing = ref(false)
const chatLoading = ref(false)
const messagesRef = ref<HTMLElement | null>(null)

const chatMessages = ref<ChatMessage[]>([])

const lastAssistantMessage = computed(() => {
  for (let i = chatMessages.value.length - 1; i >= 0; i--) {
    if (chatMessages.value[i].role === 'assistant') return chatMessages.value[i].content
  }
  return undefined
})

// Transform appData array to a key→value map for AppRenderer
const appDataMap = computed<Record<string, any>>(() => {
  return appStore.appData.reduce((acc: Record<string, any>, item: any) => {
    acc[item.key] = item.value
    return acc
  }, {})
})

// Extract uiComponents from appConfig
const uiComponents = computed(() => {
  const config = appStore.appConfig
  if (!config) return []
  return (config.uiComponents as any[]) || []
})

async function fetchChatHistory() {
  try {
    const res = await api.get(`/app/${hash.value}/chat`)
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = res.data.history || []
    chatMessages.value = history.map((m) => ({ role: m.role, content: m.content }))
  } catch {
    // Silently ignore — chat starts empty on failure
  }
}

async function loadApp() {
  loading.value = true
  loadError.value = ''
  try {
    await appStore.fetchApp(hash.value)
    requiresAuth.value = false
    await fetchChatHistory()
  } catch (err: any) {
    if (err?.response?.status === 401) {
      requiresAuth.value = true
    } else if (err?.response?.status === 404) {
      loadError.value = 'App not found.'
    } else {
      loadError.value = 'Не удалось загрузить приложение. Попробуйте обновить страницу.'
    }
  } finally {
    loading.value = false
  }
}

async function handleAuth() {
  if (!password.value.trim()) return
  authLoading.value = true
  authError.value = ''
  authMood.value = 'thinking'
  try {
    await appStore.verifyPassword(hash.value, password.value)
  } catch {
    authError.value = 'Неверный пароль. Попробуйте ещё раз.'
    authMood.value = 'confused'
    authLoading.value = false
    password.value = ''
    return
  }
  // Password verified — now load the app. Only hide the auth form after a successful fetch
  // so we never show a blank main layout when fetchApp fails.
  try {
    authMood.value = 'happy'
    await appStore.fetchApp(hash.value)
    await fetchChatHistory()
    requiresAuth.value = false
  } catch {
    authError.value = 'Не удалось загрузить приложение. Попробуйте обновить страницу.'
    authMood.value = 'confused'
  } finally {
    authLoading.value = false
    password.value = ''
  }
}

async function handleRefresh() {
  refreshing.value = true
  try {
    await appStore.fetchData(hash.value)
  } finally {
    refreshing.value = false
  }
}

async function handleDataWritten() {
  try {
    await appStore.fetchData(hash.value)
  } catch {
    // Ignore refresh failures — the write succeeded; data will be stale until next refresh
  }
}

async function handleChatSubmit(message: string) {
  chatMessages.value.push({ role: 'user', content: message })
  chatLoading.value = true
  smailoMood.value = 'thinking'

  await nextTick()
  scrollToBottom()

  try {
    const res = await appStore.chatWithApp(hash.value, message)
    const validMoods: Mood[] = ['idle', 'thinking', 'talking', 'happy', 'confused']
    const mood: Mood = validMoods.includes(res.mood as Mood) ? (res.mood as Mood) : 'idle'
    smailoMood.value = mood
    // Reset transient moods back to idle after a short delay
    if (mood === 'talking' || mood === 'thinking') {
      setTimeout(() => { smailoMood.value = 'idle' }, 3000)
    }
    chatMessages.value.push({ role: 'assistant', content: res.message, mood: res.mood })

    // If Claude returned a uiUpdate, refresh the full app (config + appData).
    // Failures here are non-fatal: the AI response is already shown; data refreshes on next interaction.
    if (res.uiUpdate) {
      try {
        await appStore.fetchApp(hash.value)
      } catch {
        // Ignore — stale data visible until next refresh
      }
    }
  } catch {
    // Remove the optimistically-pushed user message so it doesn't linger on failure.
    chatMessages.value.pop()
    smailoMood.value = 'confused'
    chatMessages.value.push({ role: 'assistant', content: 'Что-то пошло не так. Попробуйте ещё раз.', mood: 'confused' })
  } finally {
    chatLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

watch(
  () => chatMessages.value.length,
  async () => {
    await nextTick()
    scrollToBottom()
  }
)

// Vue Router reuses this component instance when navigating between /app/:hash routes.
// Clear per-app local state and reload whenever the hash param changes.
watch(hash, () => {
  chatMessages.value = []
  loadApp()
})

onMounted(() => {
  loadApp()
})
</script>

<style scoped>
.app-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  overflow: hidden;
}

/* ── Loading ───────────────────────────────────── */
.app-view__loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: #6b7280;
  font-size: 1rem;
}

/* ── Auth form ─────────────────────────────────── */
.app-view__auth {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 2rem;
}

.app-view__auth-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
}

.app-view__auth-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  max-width: 320px;
}

.app-view__password-input {
  width: 100%;
}

:deep(.app-view__password-field) {
  width: 100%;
}

.app-view__auth-error {
  margin: 0;
  font-size: 0.875rem;
  color: #ef4444;
}

/* ── Two-column layout ─────────────────────────── */
.app-view__columns {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Left column: app content ──────────────────── */
.app-view__left {
  flex: 3;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #f3f4f6;
  overflow: hidden;
}

/* ── Header ────────────────────────────────────── */
.app-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.app-view__header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.app-view__back {
  display: flex;
  align-items: center;
  color: #6b7280;
  text-decoration: none;
  font-size: 1rem;
  transition: color 0.15s;
}

.app-view__back:hover {
  color: #111827;
}

.app-view__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #111827;
}

.app-view__refresh-btn {
  color: #6b7280 !important;
}

/* ── Scrollable content ────────────────────────── */
.app-view__content {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.app-view__renderer {
  flex-shrink: 0;
}

/* ── Right column: Smailo + chat ───────────────── */
.app-view__right {
  flex: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-view__smailo-wrap {
  display: flex;
  justify-content: center;
  padding: 1rem 0 0.5rem;
  flex-shrink: 0;
}

/* ── Chat messages ─────────────────────────────── */
.app-view__messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.app-view__welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
  font-size: 0.9rem;
  text-align: center;
  padding: 1rem;
}

.app-view__welcome p {
  margin: 0;
}

/* ── Chat bubbles ──────────────────────────────── */
.app-view__bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.app-view__bubble-row--user {
  flex-direction: row-reverse;
}

.app-view__bubble-avatar {
  flex-shrink: 0;
  margin-bottom: 2px;
}

.app-view__bubble {
  max-width: 75%;
  padding: 0.55rem 0.85rem;
  border-radius: 1rem;
  line-height: 1.5;
  font-size: 0.9rem;
  word-break: break-word;
}

.app-view__bubble-row--user .app-view__bubble {
  background: #6366f1;
  color: #fff;
  border-bottom-right-radius: 0.25rem;
}

.app-view__bubble-row--assistant .app-view__bubble {
  background: #f3f4f6;
  color: #111827;
  border-bottom-left-radius: 0.25rem;
}

:deep(.app-view__bubble p) { margin: 0 0 0.4em; }
:deep(.app-view__bubble p:last-child) { margin-bottom: 0; }
:deep(.app-view__bubble strong) { font-weight: 600; }
:deep(.app-view__bubble ol),
:deep(.app-view__bubble ul) { margin: 0.25em 0; padding-left: 1.4em; }
:deep(.app-view__bubble li) { margin-bottom: 0.15em; }

/* Typing dots */
.app-view__bubble--typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0.65rem 0.9rem;
}

.app-view__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9ca3af;
  animation: blink 1.2s ease-in-out infinite;
}

.app-view__dot:nth-child(2) { animation-delay: 0.2s; }
.app-view__dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ── Input bar wrapper ─────────────────────────── */
.app-view__input-wrapper {
  flex-shrink: 0;
}

/* ── Mobile: single column ─────────────────────── */
@media (max-width: 767px) {
  .app-view__columns {
    flex-direction: column;
    overflow-y: auto;
  }

  .app-view__left {
    flex: none;
    border-right: none;
    border-bottom: 1px solid #f3f4f6;
    overflow: visible;
    min-height: 50vh;
  }

  .app-view__content {
    overflow-y: visible;
  }

  .app-view__right {
    flex: none;
    min-height: 50vh;
  }
}
</style>
