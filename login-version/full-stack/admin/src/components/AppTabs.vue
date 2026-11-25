<template>
  <div class="panel-surface flex items-center gap-3 overflow-hidden px-3 py-2.5 shadow-panel">
    <div class="min-w-0 flex-1">
      <div ref="tabsContainer" class="flex items-center gap-2 overflow-x-auto overflow-y-hidden app-scrollbar pr-1">
        <button
          v-for="tab in visibleTabs"
          :key="tab.path"
          :data-tab-path="tab.path"
          :class="[
            'group inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-all duration-200',
            tab.path === route.path
              ? 'border-transparent shadow-sm'
              : 'border-slate-200/80 bg-white/72 text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/75 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900'
          ]"
          :style="tab.path === route.path ? activeTabStyle : undefined"
          @click="handleTabChange(tab.path)"
        >
          <span class="max-w-36 truncate font-medium">{{ tab.title }}</span>
          <span
            v-if="tab.closable"
            :class="[
              'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs transition-all',
              tab.path === route.path
                ? 'bg-white/75 text-[color:var(--app-theme-color)] dark:bg-slate-900/70'
                : 'text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600 dark:group-hover:bg-slate-800 dark:group-hover:text-slate-200'
            ]"
            @click.stop="handleTabRemove(tab.path)"
          >
            ×
          </span>
        </button>
      </div>
    </div>

    <el-dropdown>
      <button class="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-4 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-900">
        标签操作
        <el-icon><ArrowDown /></el-icon>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="tabsStore.closeOthers(route.path)">关闭其它</el-dropdown-item>
          <el-dropdown-item @click="closeCurrent">关闭当前</el-dropdown-item>
          <el-dropdown-item @click="closeAll">关闭全部</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { useTabsStore } from '@/stores/tabs';
import { useAuthStore } from '@/stores/auth';
import { canAccessMenuPath } from '@/router/menu';

const route = useRoute();
const router = useRouter();
const tabsStore = useTabsStore();
const auth = useAuthStore();
const tabsContainer = ref<HTMLElement | null>(null);

const activeTab = computed(() => route.path);
const visibleTabs = computed(() =>
  tabsStore.tabs.filter((tab) => tab.path === '/task-management' || canAccessMenuPath(tab.path, auth.user.permissions, auth.isPlatformAdmin))
);
const activeTabStyle = computed(() => ({
  background: 'color-mix(in srgb, var(--app-theme-color) 14%, white)',
  color: 'var(--app-theme-color)'
}));

function scrollToActiveTab() {
  nextTick(() => {
    const activeEl = tabsContainer.value?.querySelector<HTMLElement>(`[data-tab-path="${activeTab.value}"]`);
    activeEl?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
}

watch(
  () => route.fullPath,
  () => {
    tabsStore.visit(route);
    scrollToActiveTab();
  },
  { immediate: true }
);

function handleTabChange(path: string) {
  router.push(path);
}

function handleTabRemove(path: string) {
  const currentTabs = [...visibleTabs.value];
  const idx = currentTabs.findIndex((item) => item.path === path);
  const fallback = currentTabs[idx - 1] ?? currentTabs[idx + 1] ?? currentTabs[0];

  tabsStore.close(path);

  if (route.path === path && fallback) {
    router.push(fallback.path);
  }
}

function closeCurrent() {
  const currentTab = tabsStore.tabs.find((item) => item.path === route.path);
  if (!currentTab?.closable) return;
  handleTabRemove(route.path);
}

function closeAll() {
  tabsStore.closeAll();
  router.push('/task-management');
}
</script>
