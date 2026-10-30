import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
    {
      path: '/',
      component: () => import('../layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'home', component: () => import('../views/Home.vue') },
        { path: 'columns', component: () => import('../views/ColumnsView.vue') },
        { path: 'contents', component: () => import('../views/ContentsView.vue') },
        { path: 'media', component: () => import('../views/MediaView.vue') },
        { path: 'programs', component: () => import('../views/ProgramsView.vue') },
        { path: 'schedules', component: () => import('../views/SchedulesView.vue') },
        { path: 'devices', component: () => import('../views/DevicesView.vue') },
        { path: 'publish', component: () => import('../views/PublishView.vue') },
        { path: 'review', component: () => import('../views/ReviewView.vue') },
        { path: 'logs', component: () => import('../views/LogsView.vue') },
        { path: 'users', component: () => import('../views/UsersView.vue') },
        { path: 'roles', component: () => import('../views/RolesView.vue') },
        { path: 'settings', component: () => import('../views/SettingsView.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  const token = localStorage.getItem('cps.token');
  if (to.matched.some((r) => r.meta.requiresAuth) && !token) return { name: 'login' };
  return true;
});

export default router;
