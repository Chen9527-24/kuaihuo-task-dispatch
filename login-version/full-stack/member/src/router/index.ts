import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import {
  buildWechatOAuthAuthorizeUrl,
  getStoredAppToken,
  isWeChatBrowser,
  isWeChatOAuthEnabled,
  markWechatOAuthRedirecting,
  normalizeRedirectPath,
} from '@/services/wechatAuth'
import { getDistributionMe } from '@/api'
import { resolveCurrentTenantsId } from '@/constant'

const routes: RouteRecordRaw[] = [
  { path: '/setup-required', name: 'ConfigurationRequired', component: () => import('@/pages/ConfigurationRequired.vue') },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/pages/Home.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/Login.vue'),
  },
  {
    path: '/bind-invite',
    name: 'BindInvite',
    component: () => import('@/pages/BindInvite.vue'),
  },
  {
    path: '/profile-complete',
    name: 'ProfileComplete',
    component: () => import('@/pages/ProfileComplete.vue'),
  },
  {
    path: '/task-current',
    name: 'TaskCurrent',
    component: () => import('@/pages/TaskCurrent.vue'),
  },
  {
    path: '/progress-detail',
    name: 'ProgressDetail',
    component: () => import('@/pages/ProgressDetail.vue'),
  },
  {
    path: '/leader-center',
    name: 'LeaderCenter',
    component: () => import('@/pages/LeaderCenter.vue'),
  },
  {
    path: '/records',
    name: 'Records',
    component: () => import('@/pages/Records.vue'),
  },
  {
    path: '/withdrawals',
    name: 'Withdrawals',
    component: () => import('@/pages/Withdrawals.vue'),
  },
  {
    path: '/withdrawals/records',
    name: 'WithdrawalRecords',
    component: () => import('@/pages/WithdrawalRecords.vue'),
  },

  {
    path: '/auth/wechat-callback',
    name: 'WechatCallback',
    component: () => import('@/pages/WechatCallback.vue'),
  },
  {
    path: '/wechat-open-hint',
    name: 'WechatOpenHint',
    component: () => import('@/pages/WechatOpenHint.vue'),
  },
  {
    path: '/follow-required',
    name: 'FollowRequired',
    component: () => import('@/pages/FollowRequired.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

function unwrap(resp: any) {
  return resp?.data ?? resp
}

function isWechatFollowBlocked(me: any) {
  return me?.wechatOfficialAccount?.subscribed === false || me?.wechatOfficialAccount?.mustFollow === true
}

router.beforeEach(async (to) => {
  const tenantId = resolveCurrentTenantsId()
  if (to.name === 'ConfigurationRequired') return true
  if (to.name === 'WechatCallback' || to.name === 'WechatOpenHint' || to.name === 'FollowRequired') return true
  if (!getStoredAppToken() && !tenantId) return { name: 'ConfigurationRequired' }

  const token = getStoredAppToken()
  if (token) {
    if (to.name === 'Login') return { name: 'Home' }
    try {
      const me = unwrap(await getDistributionMe())
      if (isWechatFollowBlocked(me)) {
        return { name: 'FollowRequired', query: { redirect: normalizeRedirectPath(to.fullPath) } }
      }
    } catch {
      return false
    }
    return true
  }

  const redirect = normalizeRedirectPath(to.fullPath)
  if (isWeChatOAuthEnabled()) {
    if (isWeChatBrowser()) {
      markWechatOAuthRedirecting()
      window.location.replace(buildWechatOAuthAuthorizeUrl(redirect))
      return false
    }
    return { name: 'WechatOpenHint', query: { redirect } }
  }

  if (to.name === 'Login') return true
  return { name: 'Login', query: { redirect } }
})

export default router
