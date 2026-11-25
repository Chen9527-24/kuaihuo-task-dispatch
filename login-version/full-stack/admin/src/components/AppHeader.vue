<template>
  <header class="panel-surface flex min-h-[84px] items-center justify-between px-4 py-4 shadow-panel">
    <div class="flex min-w-0 items-center gap-3">
      <button class="header-action-button shrink-0 !hidden md:!inline-flex" aria-label="展开或折叠导航" @click="app.toggleSidebar()">
        <el-icon size="18">
          <Fold v-if="!app.sidebarCollapsed" />
          <Expand v-else />
        </el-icon>
      </button>

      <el-dropdown trigger="click" class="md:!hidden" @command="(path: string) => router.push(path)">
        <button type="button" class="header-action-button" aria-label="打开业务导航"><el-icon><Operation /></el-icon></button>
        <template #dropdown><el-dropdown-menu>
          <el-dropdown-item v-for="item in mobileLinks" :key="item.path" :command="item.path">{{ item.title }}</el-dropdown-item>
        </el-dropdown-menu></template>
      </el-dropdown>
      <div class="min-w-0">
        <div class="truncate text-lg font-semibold">{{ pageTitle }}</div>
        <div class="mt-1 flex min-w-0 items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <AppBreadcrumb class="min-w-0 flex-1" />
          <span v-if="pageDescription" class="hidden rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 dark:border-slate-700/70 dark:bg-slate-800/70 dark:text-slate-300 xl:inline-flex">
            {{ pageDescription }}
          </span>
        </div>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2 self-start md:self-center">
      <el-tooltip content="收藏当前页面" placement="bottom">
        <button class="header-action-button" @click="tabs.toggleFavorite(route.path)">
          <el-icon>
            <StarFilled v-if="tabs.hasFavorite(route.path)" />
            <Star v-else />
          </el-icon>
        </button>
      </el-tooltip>

      <el-tooltip v-if="settings.showQuickNav" content="快捷导航" placement="bottom">
        <button class="header-action-button" @click="app.toggleQuickNav()">
          <el-icon><Operation /></el-icon>
        </button>
      </el-tooltip>

      <el-tooltip content="切换明暗" placement="bottom">
        <button class="header-action-button" @click="toggleThemeMode">
          <el-icon>
            <Moon v-if="effectiveDark" />
            <Sunny v-else />
          </el-icon>
        </button>
      </el-tooltip>

      <el-tooltip content="应用配置" placement="bottom">
        <button class="header-action-button header-action-button-primary" @click="app.openSettings()">
          <el-icon><Setting /></el-icon>
        </button>
      </el-tooltip>

      <el-dropdown trigger="click" @command="handleCommand">
        <button class="ml-1 flex items-center gap-3 rounded-full border border-slate-200/70 bg-white px-2 py-1.5 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
            :style="{ backgroundColor: settings.themeColor }"
          >
            <img
              v-if="auth.user.avatarUrl"
              :src="auth.user.avatarUrl"
              :alt="auth.user.name"
              class="h-full w-full rounded-full object-cover"
            />
            <template v-else>{{ auth.user.avatar }}</template>
          </div>
          <div class="hidden text-left md:block">
            <div class="max-w-32 truncate text-sm font-medium">{{ auth.user.name }}</div>
            <div class="max-w-32 truncate text-xs text-slate-500 dark:text-slate-400">{{ auth.tenantName || auth.user.role }}</div>
          </div>
          <el-icon class="hidden text-slate-400 md:block"><ArrowDown /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">个人中心</el-dropdown-item>
            <el-dropdown-item command="dailyTasks">返回每日任务</el-dropdown-item>
            <el-dropdown-item divided command="switchAccount">切换 / 添加账号</el-dropdown-item>
            <el-dropdown-item v-if="auth.tenants.length > 1" command="switchTenant">切换租户</el-dropdown-item>
            <el-dropdown-item divided command="logout">退出当前账号</el-dropdown-item>
            <el-dropdown-item v-if="auth.savedAccounts.length > 1" command="logoutAll">退出全部账号</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>

  <el-dialog
    v-model="accountSwitchDialogVisible"
    title="切换账号"
    width="min(560px, calc(100vw - 32px))"
    align-center
    append-to-body
    modal-append-to-body
    destroy-on-close
  >
    <div class="mb-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
      已成功登录过的账号会保留在本设备。系统只保存受控登录会话，不保存密码；账号被禁用、密码修改或会话过期后，需要重新登录。
    </div>

    <div class="space-y-3">
      <div
        v-for="account in auth.savedAccounts"
        :key="account.key"
        class="group flex items-center gap-3 rounded-2xl border p-4 transition"
        :class="account.key === auth.currentSavedAccountKey ? 'border-[var(--el-color-primary)] bg-[color-mix(in_srgb,var(--el-color-primary)_7%,white)]' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500'"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-3 text-left"
          :disabled="switchingAccountKey !== '' || account.key === auth.currentSavedAccountKey"
          @click="handleSwitchAccount(account.key)"
        >
          <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white" :style="{ backgroundColor: settings.themeColor }">
            <img v-if="account.avatarUrl" :src="account.avatarUrl" :alt="account.name" class="h-full w-full object-cover" />
            <template v-else>{{ account.avatar }}</template>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium text-slate-900 dark:text-slate-100">{{ account.name }}</span>
              <el-tag v-if="account.key === auth.currentSavedAccountKey" size="small" type="success" effect="plain">当前</el-tag>
            </div>
            <div class="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{{ account.account }} · {{ account.tenantName || '上次租户不可用' }}</div>
            <div class="mt-1 text-[11px] text-slate-400">最近使用：{{ formatLastUsed(account.lastUsedAt) }}</div>
          </div>
        </button>
        <el-button
          v-if="account.key !== auth.currentSavedAccountKey"
          text
          type="danger"
          :disabled="switchingAccountKey !== ''"
          @click="handleRemoveSavedAccount(account.key)"
        >
          移除
        </el-button>
      </div>
    </div>

    <template #footer>
      <el-button @click="accountSwitchDialogVisible = false">关闭</el-button>
      <el-button type="primary" @click="handleAddAccount">添加其他账号</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowDown,
  Expand,
  Fold,
  Moon,
  Operation,
  Setting,
  Star,
  StarFilled,
  Sunny
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AppBreadcrumb from '@/components/AppBreadcrumb.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useTabsStore } from '@/stores/tabs';

import { getAccessibleMenuItems, getLeafMenuItems, menuItems } from '@/router/menu';

const route = useRoute();
const router = useRouter();
const app = useAppStore();
const auth = useAuthStore();
const settings = useSettingsStore();
const tabs = useTabsStore();
const accountSwitchDialogVisible = ref(false);
const switchingAccountKey = ref('');

const mobileLinks = computed(() => getLeafMenuItems(getAccessibleMenuItems(menuItems, auth.user.permissions, auth.isPlatformAdmin)));
const pageTitle = computed(() => String(route.meta.title ?? '任务分发管理'));

const pageDescription = computed(() => {
  const map: Record<string, string> = {
    '/task-management': '查看当前账号有权限管理的任务与待办',
    '/daily-tasks': '配置视频、评论池、任务名额和单笔金额',
    '/task-orders': '核对成员证明，审核订单并记入成员钱包',
    '/app-users': '维护任务成员和领取限制',
    '/withdrawals': '审核提现申请，查看转账状态',
    '/distribution-groups': '维护邀请、团长和分佣记录',
    '/media-accounts': '配置任务使用的媒体账号',
    '/profile': '查看和编辑当前登录人的个人资料'
  };

  return map[route.path] ?? '';
});

const effectiveDark = computed(() => {
  if (settings.themeMode === 'dark') return true;
  if (settings.themeMode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
});

function toggleThemeMode() {
  settings.setThemeMode(effectiveDark.value ? 'light' : 'dark');
}

async function handleCommand(command: string) {
  if (command === 'profile') {
    await router.push('/profile');
    return;
  }

  if (command === 'dailyTasks') {
    await router.push('/daily-tasks');
    return;
  }

  if (command === 'switchAccount') {
    accountSwitchDialogVisible.value = true;
    return;
  }

  if (command === 'switchTenant') {
    try {
      auth.openTenantSwitcher();
    } catch (error) {
      ElMessage.warning(error instanceof Error ? error.message : '当前账号没有可切换的租户');
    }
    return;
  }

  if (command === 'logout') {
    const confirmed = await ElMessageBox.confirm('确认退出当前账号吗？该账号将从本设备的快速切换列表中移除。', '退出登录', {
      type: 'warning'
    }).catch(() => false);
    if (!confirmed) return;

    try {
      await auth.logout();
      await router.replace('/login');
    } catch (error) {
      const message = error instanceof Error ? error.message : '退出登录失败';
      ElMessage.error(message);
    }
    return;
  }

  if (command === 'logoutAll') {
    const confirmed = await ElMessageBox.confirm('确认退出本设备保存的全部账号吗？所有快速切换会话都会被清除。', '退出全部账号', {
      type: 'warning'
    }).catch(() => false);
    if (!confirmed) return;

    try {
      await auth.logoutAll();
      await router.replace('/login');
    } catch (error) {
      const message = error instanceof Error ? error.message : '退出全部账号失败';
      ElMessage.error(message);
    }
  }
}

async function handleAddAccount() {
  accountSwitchDialogVisible.value = false;
  await router.push('/login?mode=add');
}

async function handleSwitchAccount(key: string) {
  switchingAccountKey.value = key;
  try {
    const result = await auth.switchSavedAccount(key);
    accountSwitchDialogVisible.value = false;
    if (result.requiresTenantSelection) {
      ElMessage.info('上次使用的租户已不可用，请重新选择租户');
      return;
    }
    await router.replace('/task-management');
    ElMessage.success('账号已切换');
  } catch (error) {
    const message = error instanceof Error ? error.message : '账号切换失败，请重新登录';
    ElMessage.error(message);
  } finally {
    switchingAccountKey.value = '';
  }
}

async function handleRemoveSavedAccount(key: string) {
  const confirmed = await ElMessageBox.confirm('移除后该账号不再支持快速切换，不会影响服务器中的账号或数据。', '移除保存账号', {
    type: 'warning'
  }).catch(() => false);
  if (!confirmed) return;
  auth.removeSavedAccount(key);
  ElMessage.success('已移除保存账号');
}

function formatLastUsed(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}
</script>
