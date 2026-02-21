import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('../views/HomeView.vue'),
    },
    {
      // Legacy URL — userId not known, works without user context
      path: '/app/:hash',
      component: () => import('../views/AppView.vue'),
    },
    {
      // App view with user context — userId available for back navigation
      path: '/:userId/:hash',
      component: () => import('../views/AppView.vue'),
    },
    {
      path: '/:userId',
      component: () => import('../views/UserView.vue'),
    },
  ],
})

export default router
