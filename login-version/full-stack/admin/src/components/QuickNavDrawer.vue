<template>
  <transition name="quick-backdrop">
    <div v-if="app.quickNavOpen" class="fixed inset-0 z-20 hidden xl:block" @click="app.closeQuickNav()" />
  </transition>

  <transition name="slide-right">
    <aside
      v-if="app.quickNavOpen"
      class="fixed right-4 top-24 z-30 hidden w-72 rounded-[calc(var(--app-radius)+6px)] border border-slate-200/80 bg-white/92 p-3 shadow-panel backdrop-blur dark:border-slate-800 dark:bg-slate-900/88 xl:block"
      @click.stop
    >
      <div class="mb-3 flex items-center justify-between">
        <div class="text-sm font-semibold">快捷导航</div>
        <el-button text @click="app.closeQuickNav()">收起</el-button>
      </div>

      <el-input v-model="keyword" placeholder="搜索当前有权限的菜单" clearable />

      <div class="mt-4">
        <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">收藏</div>
        <div class="space-y-2">
          <button
            v-for="item in favoriteMenuItems"
            :key="item.path"
            class="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="handleNavigate(item.path)"
          >
            <el-icon><StarFilled /></el-icon>
            <span class="truncate">{{ item.title }}</span>
          </button>
          <div v-if="!favoriteMenuItems.length" class="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">暂无可访问的收藏菜单</div>
        </div>
      </div>

      <div class="mt-5">
        <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">菜单</div>
        <div class="max-h-80 space-y-1 overflow-y-auto app-scrollbar">
          <button
            v-for="item in filteredMenuItems"
            :key="item.path"
            class="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="handleNavigate(item.path)"
          >
            <el-icon><component :is="getMenuIcon(item.icon)" /></el-icon>
            <span class="truncate">{{ item.title }}</span>
          </button>
          <div v-if="!filteredMenuItems.length" class="rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">没有匹配的可访问菜单</div>
        </div>
      </div>
    </aside>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { StarFilled } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useTabsStore } from '@/stores/tabs';
import { getMenuIcon } from '@/components/menuIcons';
import { getAccessibleMenuItems, getLeafMenuItems, menuItems } from '@/router/menu';

const router = useRouter();
const app = useAppStore();
const auth = useAuthStore();
const tabs = useTabsStore();
const keyword = ref('');

const accessibleLeaves = computed(() => getLeafMenuItems(getAccessibleMenuItems(menuItems, auth.user.permissions, auth.isPlatformAdmin)));
const filteredMenuItems = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  if (!search) return accessibleLeaves.value;
  return accessibleLeaves.value.filter((item) => `${item.title} ${item.path}`.toLowerCase().includes(search));
});
const favoriteMenuItems = computed(() => accessibleLeaves.value.filter((item) => tabs.favoritePaths.includes(item.path)));

function handleNavigate(path: string) {
  app.closeQuickNav();
  router.push(path);
}
</script>
