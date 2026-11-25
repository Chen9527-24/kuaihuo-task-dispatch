import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import AppLayout from '@/layout/AppLayout.vue';
import { canAccessMenuPath, flatMenuItems } from './menu';
import { useAuthStore } from '@/stores/auth';

const viewMap = {
  '/task-management': { name: 'TaskManagementHome', component: () => import('@/views/TaskManagementHome.vue'), keepAlive: false },
  '/daily-tasks': { name: 'DailyTaskManagementView', component: () => import('@/views/dailytaskmanagement/index.vue'), keepAlive: true },
  '/distribution-groups': { name: 'DistributionGroupManagementView', component: () => import('@/views/distributiongroupmanagement/index.vue'), keepAlive: true },
  '/task-orders': { name: 'TaskOrderManagementView', component: () => import('@/views/taskordermanagement/index.vue'), keepAlive: false },
  '/withdrawals': { name: 'WithdrawalManagementView', component: () => import('@/views/withdrawalmanagement/index.vue'), keepAlive: true },
  '/media-accounts': { name: 'MediaAccountManagementView', component: () => import('@/views/mediaaccountmanagement/index.vue'), keepAlive: true },
  '/app-users': { name: 'AppUserManagementView', component: () => import('@/views/appusermanagement/index.vue'), keepAlive: true },
  '/tenants': { name: 'TenantManagementView', component: () => import('@/views/tenantmanagement/index.vue'), keepAlive: true },
  '/accounts': { name: 'AccountManagementView', component: () => import('@/views/accountmanagement/index.vue'), keepAlive: true },
  '/roles': { name: 'RoleManagementView', component: () => import('@/views/rolemanagement/index.vue'), keepAlive: true },
  '/permissions': { name: 'PermissionManagementView', component: () => import('@/views/permissionmanagement/index.vue'), keepAlive: true },
  '/dicts': { name: 'DictManagementView', component: () => import('@/views/dictmanagement/index.vue'), keepAlive: true },
  '/profile': { name: 'ProfileView', component: () => import('@/views/ProfileView.vue'), keepAlive: false }
} as const;

type ViewPath = keyof typeof viewMap;

export const keepAliveRouteNames = Object.values(viewMap).filter((item) => item.keepAlive).map((item) => item.name);

const children: RouteRecordRaw[] = flatMenuItems.map((item) => {
  const view = viewMap[item.path as ViewPath];
  return {
    path: item.path,
    name: view.name,
    component: view.component,
    meta: { title: item.title, icon: item.icon, closable: item.closable ?? item.path !== '/task-management', keepAlive: view.keepAlive }
  };
});

const routes: RouteRecordRaw[] = [
  { path: '/', component: AppLayout, redirect: '/task-management', meta: { requiresAuth: true }, children },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, title: '登录' } },
  { path: '/:pathMatch(.*)*', redirect: '/task-management' }
];

const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) });

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    // mode=add intentionally opens the login page without dropping the active
    // session, so another account can be added to the quick-switch list.
    if (auth.isLoggedIn && to.path === '/login' && to.query.mode !== 'add') return '/task-management';
    return true;
  }

  if (!auth.isLoggedIn) {
    auth.setPostLoginRedirect(to.fullPath);
    return `/login?redirect=${encodeURIComponent(to.fullPath)}`;
  }

  try {
    await auth.bootstrap();
  } catch {
    return '/login';
  }

  if (!canAccessMenuPath(to.path, auth.user.permissions, auth.isPlatformAdmin)) {
    return '/task-management';
  }
  return true;
});

export default router;
