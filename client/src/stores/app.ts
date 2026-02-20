import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export const useAppStore = defineStore('app', () => {
  const appConfig = ref<Record<string, any> | null>(null)
  const appName = ref<string>('')
  const appData = ref<Record<string, any>[]>([])
  const isAuthenticated = ref(false)

  async function fetchApp(hash: string) {
    const res = await api.get(`/app/${hash}`)
    appConfig.value = res.data.config
    appName.value = res.data.appName || ''
    appData.value = res.data.appData || []
    isAuthenticated.value = true
    return res.data
  }

  async function verifyPassword(hash: string, pwd: string) {
    const res = await api.post(`/app/${hash}/verify`, { password: pwd })
    const token = res.data.token
    if (token) {
      localStorage.setItem('smailo_token', token)
      isAuthenticated.value = true
    }
    return token
  }

  async function fetchData(hash: string) {
    const res = await api.get(`/app/${hash}/data`)
    appData.value = res.data.appData || []
    return res.data
  }

  async function chatWithApp(hash: string, message: string) {
    const res = await api.post(`/app/${hash}/chat`, { message })
    return res.data as { mood: string; message: string; uiUpdate?: any[] }
  }

  return { appConfig, appName, appData, isAuthenticated, fetchApp, verifyPassword, fetchData, chatWithApp }
})
