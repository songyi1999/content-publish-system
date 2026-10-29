import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/users', component: () => import('../views/UsersView.vue'), meta: { requiresAuth: true } },
    { path: '/roles', component: () => import('../views/RolesView.vue'), meta: { requiresAuth: true } },
    { path: '/logs', component: () => import('../views/LogsView.vue'), meta: { requiresAuth: true } },
    { path: '/columns', component: () => import('../views/ColumnsView.vue'), meta: { requiresAuth: true } },
    { path: '/media', component: () => import('../views/MediaView.vue'), meta: { requiresAuth: true } },
    { path: '/contents', component: () => import('../views/ContentsView.vue'), meta: { requiresAuth: true } },
    { path: '/review', component: () => import('../views/ReviewView.vue'), meta: { requiresAuth: true } },
    { path: '/publish', component: () => import('../views/PublishView.vue'), meta: { requiresAuth: true } },
    { path: '/devices', component: () => import('../views/DevicesView.vue'), meta: { requiresAuth: true } },
    { path: '/programs', component: () => import('../views/ProgramsView.vue'), meta: { requiresAuth: true } },
    { path: '/schedules', component: () => import('../views/SchedulesView.vue'), meta: { requiresAuth: true } },
  ],
});

router.beforeEach((to) => {
  const token = localStorage.getItem('cps.token');
  if (to.meta.requiresAuth && !token) return { name: 'login' };
  return true;
});

export default router;
