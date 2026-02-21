<template>
  <div class="home">
    <div class="home__content">
      <Smailo mood="idle" :size="200" />
      <h1 class="home__title">Smailo</h1>
      <p class="home__tagline">AI-powered personal app builder</p>

      <Button
        label="Создать нового пользователя"
        :loading="creating"
        @click="handleCreate"
        class="home__create-btn"
      />

      <div class="home__divider">
        <span>или</span>
      </div>

      <div class="home__enter-row">
        <InputText
          v-model="enteredUserId"
          placeholder="Введите ID пользователя"
          class="home__userid-input"
          @keydown.enter="handleGoto"
        />
        <Button label="Перейти" @click="handleGoto" :loading="checking" />
      </div>

      <p v-if="errorMsg" class="home__error">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Smailo from '../components/Smailo.vue'
import api from '../api'
import { useUserStore } from '../stores/user'

const router = useRouter()
const userStore = useUserStore()
const creating = ref(false)
const checking = ref(false)
const enteredUserId = ref('')
const errorMsg = ref('')

const USER_ID_REGEX = /^[A-Za-z0-9]{1,50}$/

onMounted(() => {
  const stored = localStorage.getItem('smailo_user_id')
  if (stored && USER_ID_REGEX.test(stored)) {
    router.replace(`/${stored}`)
  }
})

async function handleCreate() {
  creating.value = true
  errorMsg.value = ''
  try {
    const userId = await userStore.createUser()
    router.push(`/${userId}`)
  } catch {
    errorMsg.value = 'Не удалось создать пользователя. Попробуйте ещё раз.'
  } finally {
    creating.value = false
  }
}

async function handleGoto() {
  const userId = enteredUserId.value.trim()
  if (!userId) return
  checking.value = true
  errorMsg.value = ''
  try {
    await api.get(`/users/${userId}`)
    localStorage.setItem('smailo_user_id', userId)
    router.push(`/${userId}`)
  } catch (err: any) {
    if (err?.response?.status === 404) {
      errorMsg.value = 'Пользователь не найден. Проверьте ID.'
    } else {
      errorMsg.value = 'Ошибка при поиске пользователя. Попробуйте ещё раз.'
    }
  } finally {
    checking.value = false
  }
}
</script>

<style scoped>
.home {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #ffffff;
  padding: 2rem 1rem;
}

.home__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  max-width: 380px;
  width: 100%;
}

.home__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
}

.home__tagline {
  margin: 0;
  font-size: 1rem;
  color: #6b7280;
}

.home__create-btn {
  width: 100%;
}

.home__divider {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.75rem;
  color: #9ca3af;
  font-size: 0.9rem;
}

.home__divider::before,
.home__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e7eb;
}

.home__enter-row {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}

.home__userid-input {
  flex: 1;
}

.home__error {
  margin: 0;
  color: #ef4444;
  font-size: 0.875rem;
  text-align: center;
}
</style>
