import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('../views/HomeView.vue'),
    },
    {
      path: '/app/:hash',
      component: () => import('../views/AppView.vue'),
    },
    {
      path: '/:userId',
      component: () => import('../views/UserView.vue'),
    },
  ],
})

export default router
