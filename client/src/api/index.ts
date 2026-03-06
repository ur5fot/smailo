import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  // Send global JWT for user authentication
  const globalToken = localStorage.getItem('smailo_token')
  if (globalToken) {
    config.headers.Authorization = `Bearer ${globalToken}`
  }

  // For app routes, also send per-app JWT (password-protected apps) via separate header
  const appMatch = config.url?.match(/^\/app\/([^/]+)/)
  if (appMatch) {
    const perAppToken = localStorage.getItem(`smailo_token_${appMatch[1]}`)
    if (perAppToken) {
      config.headers['X-App-Token'] = perAppToken
    }
  }

  return config
})

export default api
