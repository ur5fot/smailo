<template>
  <div class="invite">
    <div class="invite__content">
      <Smailo mood="idle" :size="160" />
      <h1 class="invite__title">Приглашение в приложение</h1>

      <div v-if="status === 'needAccount'" class="invite__status">
        <p>Для принятия приглашения нужен аккаунт.</p>
        <Button label="Создать аккаунт и принять" :loading="creatingUser" @click="handleCreateAndAccept" />
      </div>

      <div v-else-if="status === 'loading'" class="invite__status">
        <ProgressSpinner style="width: 40px; height: 40px" />
        <p>Принимаем приглашение...</p>
      </div>

      <div v-else-if="status === 'success'" class="invite__status invite__status--success">
        <i class="pi pi-check-circle" style="font-size: 2rem; color: #22c55e"></i>
        <p>Вы присоединились как <strong>{{ acceptedRole }}</strong></p>
        <p class="invite__redirect">Перенаправление...</p>
      </div>

      <div v-else-if="status === 'error'" class="invite__status invite__status--error">
        <i class="pi pi-times-circle" style="font-size: 2rem; color: #ef4444"></i>
        <p>{{ errorMsg }}</p>
        <Button label="На главную" @click="goHome" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import Smailo from '../components/Smailo.vue'
import api from '../api'
import { useUserStore } from '../stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const status = ref<'loading' | 'needAccount' | 'success' | 'error'>('loading')
const errorMsg = ref('')
const acceptedRole = ref('')
const creatingUser = ref(false)

function hasUser(): boolean {
  const stored = localStorage.getItem('smailo_user_id')
  const token = localStorage.getItem('smailo_token')
  if (stored && token) {
    // Verify JWT userId matches stored userId to prevent identity desync
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.userId !== stored) {
        // Token belongs to a different user — clear stale token
        localStorage.removeItem('smailo_token')
        return false
      }
    } catch {
      localStorage.removeItem('smailo_token')
      return false
    }
    userStore.userId = stored
    return true
  }
  return false
}

async function doAccept() {
  const hash = route.params.hash as string
  const token = route.params.token as string

  status.value = 'loading'
  try {
    const res = await api.post(`/app/${hash}/members/invite/${token}/accept`)
    acceptedRole.value = res.data.role
    status.value = 'success'

    setTimeout(() => {
      router.replace(`/${userStore.userId}/${hash}`)
    }, 1500)
  } catch (err: any) {
    status.value = 'error'
    const resp = err?.response
    const msg = resp?.data?.error || ''

    if (resp?.status === 410) {
      if (msg.includes('expired')) {
        errorMsg.value = 'Приглашение истекло.'
      } else {
        errorMsg.value = 'Это приглашение уже было использовано.'
      }
    } else if (resp?.status === 404) {
      errorMsg.value = 'Приглашение недействительно.'
    } else if (resp?.status === 401) {
      errorMsg.value = 'Ошибка авторизации. Попробуйте обновить страницу.'
    } else {
      errorMsg.value = 'Не удалось принять приглашение. Попробуйте позже.'
    }
  }
}

async function handleCreateAndAccept() {
  creatingUser.value = true
  try {
    await userStore.createUser()
    await doAccept()
  } catch {
    status.value = 'error'
    errorMsg.value = 'Не удалось создать аккаунт. Попробуйте позже.'
  } finally {
    creatingUser.value = false
  }
}

async function acceptInvite() {
  const hash = route.params.hash as string
  const token = route.params.token as string

  if (!hash || !token) {
    status.value = 'error'
    errorMsg.value = 'Некорректная ссылка приглашения.'
    return
  }

  if (!hasUser()) {
    status.value = 'needAccount'
    return
  }

  await doAccept()
}

function goHome() {
  const uid = localStorage.getItem('smailo_user_id')
  if (uid) {
    router.push(`/${uid}`)
  } else {
    router.push('/')
  }
}

onMounted(() => {
  acceptInvite()
})
</script>

<style scoped>
.invite {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #ffffff;
  padding: 2rem 1rem;
}

.invite__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  max-width: 400px;
  width: 100%;
}

.invite__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  text-align: center;
}

.invite__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
  color: #374151;
}

.invite__status p {
  margin: 0;
}

.invite__redirect {
  color: #9ca3af;
  font-size: 0.875rem;
}

.invite__status--error p {
  color: #ef4444;
}
</style>
