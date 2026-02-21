import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export interface AppSummary {
  hash: string
  appName: string
  description: string
  createdAt: string
}

export const useUserStore = defineStore('user', () => {
  const userId = ref<string | null>(null)
  const apps = ref<AppSummary[]>([])

  async function fetchUser(uid: string) {
    const res = await api.get(`/users/${uid}`)
    userId.value = uid
    return res.data as { userId: string; createdAt: string }
  }

  async function fetchApps(uid: string) {
    userId.value = uid
    const res = await api.get(`/users/${uid}/apps`)
    apps.value = res.data as AppSummary[]
  }

  async function createUser() {
    const res = await api.post('/users')
    userId.value = res.data.userId
    localStorage.setItem('smailo_user_id', res.data.userId)
    return res.data.userId as string
  }

  return { userId, apps, fetchUser, fetchApps, createUser }
})
