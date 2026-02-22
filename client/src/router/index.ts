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
      path: '/app/:hash([a-fA-F0-9]{1,128})',
      component: () => import('../views/AppView.vue'),
    },
    {
      // App view with user context — userId available for back navigation
      path: '/:userId([A-Za-z0-9]{1,50})/:hash([a-fA-F0-9]{1,128})',
      component: () => import('../views/AppView.vue'),
    },
    {
      path: '/:userId([A-Za-z0-9]{1,50})',
      component: () => import('../views/UserView.vue'),
    },
  ],
})

export default router
