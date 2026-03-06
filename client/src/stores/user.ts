import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export interface AppSummary {
  hash: string
  appName: string
  description: string
  createdAt: string
  lastVisit: string | null
  role: 'owner' | 'editor' | 'viewer'
}

export const useUserStore = defineStore('user', () => {
  const userId = ref<string | null>(null)
  const myApps = ref<AppSummary[]>([])
  const sharedApps = ref<AppSummary[]>([])

  // Backward-compatible getter: all apps combined
  const apps = ref<AppSummary[]>([])

  async function fetchUser(uid: string) {
    const res = await api.get(`/users/${uid}`)
    userId.value = uid
    return res.data as { userId: string; createdAt: string }
  }

  async function fetchApps(uid: string) {
    userId.value = uid
    const res = await api.get(`/users/${uid}/apps`)
    const data = res.data

    // Handle new format { myApps, sharedApps } and legacy array format
    if (data && typeof data === 'object' && 'myApps' in data) {
      myApps.value = data.myApps as AppSummary[]
      sharedApps.value = data.sharedApps as AppSummary[]
    } else if (Array.isArray(data)) {
      // Legacy format: flat array, all owned
      myApps.value = (data as AppSummary[]).map(a => ({ ...a, role: 'owner' as const }))
      sharedApps.value = []
    }

    apps.value = [...myApps.value, ...sharedApps.value]
  }

  async function createUser() {
    const res = await api.post('/users')
    userId.value = res.data.userId
    localStorage.setItem('smailo_user_id', res.data.userId)
    if (res.data.token) {
      localStorage.setItem('smailo_token', res.data.token)
    }
    return res.data.userId as string
  }

  return { userId, apps, myApps, sharedApps, fetchUser, fetchApps, createUser }
})
