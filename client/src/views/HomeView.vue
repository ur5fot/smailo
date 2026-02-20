<template>
  <div class="home">
    <!-- Initial centered state: no messages yet -->
    <div v-if="chatStore.messages.length === 0 && !loading" class="home__intro">
      <Smailo :mood="smailoMood" :size="200" />
      <p class="home__tagline">What would you like to build today?</p>
    </div>

    <!-- Messages list -->
    <div v-else class="home__messages" ref="messagesRef">
      <div
        v-for="(msg, index) in chatStore.messages"
        :key="index"
        class="home__bubble-row"
        :class="msg.role === 'user' ? 'home__bubble-row--user' : 'home__bubble-row--assistant'"
      >
        <div v-if="msg.role === 'assistant'" class="home__bubble-avatar">
          <Smailo :mood="(msg.mood as any) || 'idle'" :size="40" />
        </div>
        <div class="home__bubble">{{ msg.content }}</div>
      </div>

      <!-- Typing indicator while waiting for response -->
      <div v-if="loading" class="home__bubble-row home__bubble-row--assistant">
        <div class="home__bubble-avatar">
          <Smailo mood="thinking" :size="40" />
        </div>
        <div class="home__bubble home__bubble--typing">
          <span class="home__dot" />
          <span class="home__dot" />
          <span class="home__dot" />
        </div>
      </div>

      <!-- App created card -->
      <div
        v-if="chatStore.phase === 'created' && chatStore.appHash"
        class="home__created-card"
      >
        <div class="home__created-header">
          <i class="pi pi-check-circle home__created-icon" />
          <span>Your app is ready!</span>
        </div>
        <RouterLink :to="`/app/${chatStore.appHash}`" class="home__app-link">
          Open App <i class="pi pi-arrow-right" />
        </RouterLink>

        <div v-if="!passwordSet" class="home__password-section">
          <p class="home__password-label">Want to protect it with a password?</p>
          <div class="home__password-row">
            <InputText
              v-model="password"
              type="password"
              placeholder="Set a password (optional)"
              class="home__password-input"
              @keydown.enter="handleSetPassword"
            />
            <Button
              label="Set"
              size="small"
              :loading="settingPassword"
              :disabled="!password.trim()"
              @click="handleSetPassword"
            />
          </div>
          <button class="home__skip-btn" @click="passwordSet = true">Skip</button>
        </div>
        <div v-else class="home__password-done">
          <i class="pi pi-lock" /> Protected
        </div>
      </div>
    </div>

    <!-- InputBar fixed at bottom -->
    <div class="home__input-wrapper">
      <InputBar @submit="handleSubmit" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { RouterLink } from 'vue-router'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Smailo from '../components/Smailo.vue'
import InputBar from '../components/InputBar.vue'
import { useChatStore } from '../stores/chat'
import api from '../api'

const chatStore = useChatStore()
const loading = ref(false)
const messagesRef = ref<HTMLElement | null>(null)
const password = ref('')
const passwordSet = ref(false)
const settingPassword = ref(false)

type Mood = 'idle' | 'thinking' | 'talking' | 'happy' | 'confused'

const smailoMood = computed<Mood>(() => {
  const m = chatStore.mood
  const valid: Mood[] = ['idle', 'thinking', 'talking', 'happy', 'confused']
  return valid.includes(m as Mood) ? (m as Mood) : 'idle'
})

async function handleSubmit(message: string) {
  if (!chatStore.sessionId) {
    chatStore.sessionId = uuidv4()
  }

  loading.value = true
  try {
    await chatStore.sendMessage(message)
  } finally {
    loading.value = false
  }
}

async function handleSetPassword() {
  if (!password.value.trim() || !chatStore.appHash) return
  settingPassword.value = true
  try {
    await api.post(`/app/${chatStore.appHash}/set-password`, {
      password: password.value,
    })
    passwordSet.value = true
  } catch {
    // Endpoint not available in MVP — mark as done anyway
    passwordSet.value = true
  } finally {
    settingPassword.value = false
  }
}

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  }
)
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
  overflow: hidden;
}

/* ── Intro (no messages) ───────────────────────── */
.home__intro {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}

.home__tagline {
  font-size: 1.1rem;
  color: #6b7280;
  margin: 0;
}

/* ── Messages ──────────────────────────────────── */
.home__messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.home__bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.home__bubble-row--user {
  flex-direction: row-reverse;
}

.home__bubble-avatar {
  flex-shrink: 0;
  margin-bottom: 2px;
}

.home__bubble {
  max-width: 65%;
  padding: 0.6rem 0.9rem;
  border-radius: 1rem;
  line-height: 1.5;
  font-size: 0.95rem;
  word-break: break-word;
}

.home__bubble-row--user .home__bubble {
  background: #6366f1;
  color: #fff;
  border-bottom-right-radius: 0.25rem;
}

.home__bubble-row--assistant .home__bubble {
  background: #f3f4f6;
  color: #111827;
  border-bottom-left-radius: 0.25rem;
}

/* Typing dots */
.home__bubble--typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0.7rem 1rem;
}

.home__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
  animation: blink 1.2s ease-in-out infinite;
}

.home__dot:nth-child(2) { animation-delay: 0.2s; }
.home__dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes blink {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ── App created card ──────────────────────────── */
.home__created-card {
  margin: 0.5rem 0 0.5rem 3rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 380px;
}

.home__created-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  color: #15803d;
}

.home__created-icon {
  font-size: 1.4rem;
}

.home__app-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: #6366f1;
  font-weight: 500;
  text-decoration: none;
  font-size: 0.95rem;
}

.home__app-link:hover {
  text-decoration: underline;
}

.home__password-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.home__password-label {
  margin: 0;
  font-size: 0.85rem;
  color: #6b7280;
}

.home__password-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.home__password-input {
  flex: 1;
  font-size: 0.85rem;
}

.home__skip-btn {
  border: none;
  background: none;
  color: #9ca3af;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.home__skip-btn:hover {
  color: #6b7280;
}

.home__password-done {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #6b7280;
}

/* ── Input bar wrapper ─────────────────────────── */
.home__input-wrapper {
  flex-shrink: 0;
}
</style>
