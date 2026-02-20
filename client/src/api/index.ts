import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  // Derive the app hash from the URL to use per-app token storage
  const appMatch = config.url?.match(/^\/app\/([^/]+)/)
  const tokenKey = appMatch ? `smailo_token_${appMatch[1]}` : 'smailo_token'
  const token = localStorage.getItem(tokenKey)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
