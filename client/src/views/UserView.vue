<template>
  <div class="user-view">
    <!-- Loading user -->
    <div v-if="loadingUser" class="user-view__loading">
      <Smailo mood="thinking" :size="80" />
      <p>Загрузка...</p>
    </div>

    <!-- User not found -->
    <div v-else-if="userNotFound" class="user-view__loading">
      <Smailo mood="confused" :size="80" />
      <p>Пользователь не найден.</p>
      <Button label="На главную" @click="router.push('/')" />
    </div>

    <!-- Main content -->
    <template v-else>
      <!-- Header -->
      <header class="user-view__header">
        <router-link to="/" class="user-view__back">
          <i class="pi pi-arrow-left" /> Главная
        </router-link>
        <span class="user-view__userid-badge">ID: {{ userId }}</span>
      </header>

      <!-- Two-column layout -->
      <div class="user-view__columns">
        <!-- Left column: apps list -->
        <div class="user-view__left">
          <div class="user-view__apps-header">
            <h2 class="user-view__apps-title">Мои приложения</h2>
            <Button
              icon="pi pi-refresh"
              text
              rounded
              :loading="loadingApps"
              title="Обновить список"
              @click="loadApps"
            />
          </div>

          <!-- Loading indicator -->
          <div v-if="loadingApps && userStore.apps.length === 0" class="user-view__apps-loading">
            <i class="pi pi-spin pi-spinner" /> Загрузка...
          </div>

          <!-- Empty state -->
          <div v-else-if="userStore.apps.length === 0" class="user-view__empty">
            <p>Пока нет приложений.</p>
            <p class="user-view__empty-hint">Создайте первое с помощью ассистента!</p>
          </div>

          <!-- App cards -->
          <div v-else class="user-view__apps-list">
            <router-link
              v-for="app in userStore.apps"
              :key="app.hash"
              :to="`/${userId}/${app.hash}`"
              class="user-view__app-card"
            >
              <div class="user-view__app-name">{{ app.appName }}</div>
              <div class="user-view__app-desc">{{ app.description }}</div>
            </router-link>
          </div>
        </div>

        <!-- Right column: AI chat -->
        <div class="user-view__right">
          <div class="user-view__smailo-wrap">
            <Smailo :mood="(chatStore.mood as any)" :size="80" />
          </div>

          <!-- Messages area -->
          <div class="user-view__messages" ref="messagesRef">
            <div v-if="chatStore.messages.length === 0" class="user-view__welcome">
              <p>Привет! Расскажите, какое приложение вы хотите создать?</p>
            </div>

            <template v-for="(msg, i) in chatStore.messages" :key="i">
              <div
                class="user-view__bubble-row"
                :class="msg.role === 'user' ? 'user-view__bubble-row--user' : 'user-view__bubble-row--assistant'"
              >
                <div
                  v-if="msg.role === 'assistant'"
                  class="user-view__bubble"
                  v-html="renderMd(msg.content)"
                />
                <div v-else class="user-view__bubble">{{ msg.content }}</div>
              </div>
              <!-- App config preview card shown in confirm phase -->
              <div v-if="msg.appConfig" class="user-view__confirm-card">
                <div class="user-view__confirm-title">{{ msg.appConfig.appName }}</div>
                <div class="user-view__confirm-desc">{{ msg.appConfig.description }}</div>
                <div v-if="msg.appConfig.uiComponents?.length" class="user-view__confirm-section">
                  <div class="user-view__confirm-label">Компоненты ({{ msg.appConfig.uiComponents.length }})</div>
                  <div class="user-view__confirm-chips">
                    <span
                      v-for="(c, j) in msg.appConfig.uiComponents"
                      :key="j"
                      class="user-view__confirm-chip"
                    >{{ c.component }}</span>
                  </div>
                </div>
                <div v-if="msg.appConfig.cronJobs?.length" class="user-view__confirm-section">
                  <div class="user-view__confirm-label">Автоматизация ({{ msg.appConfig.cronJobs.length }})</div>
                  <div
                    v-for="(job, j) in msg.appConfig.cronJobs"
                    :key="j"
                    class="user-view__confirm-job"
                  >
                    <span class="user-view__confirm-job-name">{{ job.name }}</span>
                    <span class="user-view__confirm-job-schedule">{{ job.humanReadable || job.schedule }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- Typing indicator -->
            <div v-if="chatLoading" class="user-view__bubble-row user-view__bubble-row--assistant">
              <div class="user-view__bubble user-view__bubble--typing">
                <span class="user-view__dot" />
                <span class="user-view__dot" />
                <span class="user-view__dot" />
              </div>
            </div>
          </div>

          <!-- Input bar -->
          <div class="user-view__input-wrapper">
            <InputBar :last-assistant-message="lastAssistantMessage" @submit="handleChatSubmit" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import Button from 'primevue/button'
import Smailo from '../components/Smailo.vue'
import InputBar from '../components/InputBar.vue'
import { useChatStore } from '../stores/chat'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const userStore = useUserStore()

const userId = computed(() => route.params.userId as string)
const loadingUser = ref(true)

const lastAssistantMessage = computed(() => {
  const msgs = chatStore.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i].content
  }
  return undefined
})
const userNotFound = ref(false)
const loadingApps = ref(false)
const chatLoading = ref(false)
const messagesRef = ref<HTMLElement | null>(null)

async function loadApps() {
  loadingApps.value = true
  try {
    await userStore.fetchApps(userId.value)
  } finally {
    loadingApps.value = false
  }
}

onMounted(async () => {
  // Set deterministic session ID for this user's home chat (synchronous — no API call).
  chatStore.initSession(userId.value)
  try {
    await userStore.fetchUser(userId.value)
    // Only write to localStorage if we don't already have a different stored identity.
    // Visiting another user's page should not overwrite the current user's stored ID.
    const storedId = localStorage.getItem('smailo_user_id')
    if (!storedId || storedId === userId.value) {
      localStorage.setItem('smailo_user_id', userId.value)
    }
  } catch (err: any) {
    userNotFound.value = true
    loadingUser.value = false
    // Only clear stale userId on 404 — transient network/server errors should not
    // permanently destroy the stored ID; the user can refresh and try again
    if (err?.response?.status === 404) {
      localStorage.removeItem('smailo_user_id')
    }
    return
  }
  loadingUser.value = false
  // Load previous chat history (best-effort — silently ignored on failure)
  await chatStore.loadHistory()
  await loadApps()
})

async function handleChatSubmit(message: string) {
  chatLoading.value = true
  try {
    const data = await chatStore.sendMessage(message, userId.value)
    if (data.phase === 'created' && data.appHash) {
      await loadApps()
      router.push(`/${userId.value}/${data.appHash}`)
    }
  } catch {
    // Error handled inside store (message popped, mood set to confused)
  } finally {
    chatLoading.value = false
    await nextTick()
    scrollToBottom()
  }
}

function renderMd(text: string): string {
  return marked.parse(text) as string
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  }
)
</script>

<style scoped>
.user-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  overflow: hidden;
}

/* ── Loading / error states ── */
.user-view__loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: #6b7280;
  font-size: 1rem;
}

/* ── Header ── */
.user-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 1.25rem;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
}

.user-view__back {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.875rem;
  transition: color 0.15s;
}

.user-view__back:hover {
  color: #111827;
}

.user-view__userid-badge {
  font-size: 0.75rem;
  color: #9ca3af;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 1rem;
  padding: 0.2rem 0.6rem;
}

/* ── Two-column layout ── */
.user-view__columns {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Left column: apps list ── */
.user-view__left {
  flex: 3;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #f3f4f6;
  overflow-y: auto;
  padding: 1.25rem 1rem;
  gap: 0.75rem;
}

.user-view__apps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.user-view__apps-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #111827;
}

.user-view__apps-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #9ca3af;
  font-size: 0.9rem;
  padding: 0.5rem 0;
}

.user-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0.5rem;
  color: #6b7280;
  font-size: 0.95rem;
  text-align: center;
  padding: 2rem 0;
}

.user-view__empty p {
  margin: 0;
}

.user-view__empty-hint {
  color: #9ca3af;
  font-size: 0.85rem;
}

.user-view__apps-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.user-view__app-card {
  display: block;
  padding: 0.85rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.user-view__app-card:hover {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
}

.user-view__app-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: #111827;
  margin-bottom: 0.25rem;
}

.user-view__app-desc {
  font-size: 0.825rem;
  color: #6b7280;
  line-height: 1.4;
}

/* ── Right column: AI chat ── */
.user-view__right {
  flex: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-view__smailo-wrap {
  display: flex;
  justify-content: center;
  padding: 1rem 0 0.5rem;
  flex-shrink: 0;
}

.user-view__messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.user-view__welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
  font-size: 0.9rem;
  text-align: center;
  padding: 1rem;
}

.user-view__welcome p {
  margin: 0;
}

/* ── Chat bubbles ── */
.user-view__bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.user-view__bubble-row--user {
  flex-direction: row-reverse;
}

.user-view__bubble-avatar {
  flex-shrink: 0;
  margin-bottom: 2px;
}

.user-view__bubble {
  max-width: 75%;
  padding: 0.55rem 0.85rem;
  border-radius: 1rem;
  line-height: 1.5;
  font-size: 0.9rem;
  word-break: break-word;
}

.user-view__bubble-row--user .user-view__bubble {
  background: #6366f1;
  color: #fff;
  border-bottom-right-radius: 0.25rem;
}

.user-view__bubble-row--assistant .user-view__bubble {
  background: #f3f4f6;
  color: #111827;
  border-bottom-left-radius: 0.25rem;
}

:deep(.user-view__bubble p) { margin: 0 0 0.4em; }
:deep(.user-view__bubble p:last-child) { margin-bottom: 0; }
:deep(.user-view__bubble strong) { font-weight: 600; }
:deep(.user-view__bubble ol),
:deep(.user-view__bubble ul) { margin: 0.25em 0; padding-left: 1.4em; }
:deep(.user-view__bubble li) { margin-bottom: 0.15em; }

/* Typing dots */
.user-view__bubble--typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0.65rem 0.9rem;
}

.user-view__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9ca3af;
  animation: blink 1.2s ease-in-out infinite;
}

.user-view__dot:nth-child(2) { animation-delay: 0.2s; }
.user-view__dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ── Input bar ── */
.user-view__input-wrapper {
  flex-shrink: 0;
}

/* ── Confirm card ── */
.user-view__confirm-card {
  margin: 0.25rem 2.5rem 0.25rem 2.5rem;
  padding: 0.85rem 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.user-view__confirm-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #111827;
}

.user-view__confirm-desc {
  font-size: 0.825rem;
  color: #6b7280;
  line-height: 1.4;
}

.user-view__confirm-section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.user-view__confirm-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.user-view__confirm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.user-view__confirm-chip {
  background: #ede9fe;
  color: #6366f1;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.4rem;
  font-weight: 500;
}

.user-view__confirm-job {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: #374151;
  gap: 0.5rem;
}

.user-view__confirm-job-name {
  font-weight: 500;
}

.user-view__confirm-job-schedule {
  color: #9ca3af;
  font-size: 0.75rem;
}

/* ── Mobile: single column ── */
@media (max-width: 767px) {
  .user-view__columns {
    flex-direction: column;
    overflow-y: auto;
  }

  .user-view__left {
    flex: none;
    border-right: none;
    border-bottom: 1px solid #f3f4f6;
    overflow-y: visible;
    max-height: 40vh;
  }

  .user-view__right {
    flex: none;
    min-height: 60vh;
  }
}
</style>
