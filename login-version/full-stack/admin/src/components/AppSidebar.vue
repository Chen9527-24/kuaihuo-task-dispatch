<template>
  <aside
    :class="[
      'hidden h-screen shrink-0 border-r border-slate-200/70 bg-white/92 py-4 transition-all dark:border-slate-800 dark:bg-slate-900/88 md:flex md:flex-col',
      app.sidebarCollapsed ? 'w-[88px] px-2' : 'w-[260px] px-3'
    ]"
  >
    <div :class="['mb-4 flex items-center gap-3 px-2', app.sidebarCollapsed ? 'justify-center px-0' : '']">
      <div class="flex h-11 w-11 items-center justify-center rounded-[20px] text-white shadow-panel" :style="{ backgroundColor: settings.themeColor }">
        <img v-if="auth.user.avatarUrl" :src="auth.user.avatarUrl" :alt="auth.user.name" class="h-full w-full rounded-[20px] object-cover" />
        <template v-else>{{ auth.user.avatar }}</template>
      </div>
      <div v-if="!app.sidebarCollapsed" class="min-w-0">
        <div class="truncate text-sm font-semibold">任务分发管理</div>
        <div class="truncate text-xs text-slate-500 dark:text-slate-400">{{ auth.user.name }}</div>
      </div>
    </div>

    <div class="min-h-0 flex-1 select-none">
      <el-scrollbar height="100%">
        <el-menu
          :default-active="route.path"
          :default-openeds="openedMenus"
          :collapse="app.sidebarCollapsed"
          :collapse-transition="false"
          class="app-menu border-none bg-transparent select-none"
          @select="handleSelect"
        >
          <SidebarMenuNode v-for="item in accessibleMenuItems" :key="item.path" :item="item" />
        </el-menu>
      </el-scrollbar>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SidebarMenuNode from '@/components/SidebarMenuNode.vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { getAccessibleMenuItems, menuItems } from '@/router/menu';
import type { MenuItem } from '@/types';

const route = useRoute();
const router = useRouter();
const app = useAppStore();
const auth = useAuthStore();
const settings = useSettingsStore();

const accessibleMenuItems = computed(() => getAccessibleMenuItems(menuItems, auth.user.permissions, auth.isPlatformAdmin));
const openedMenus = computed(() => collectParentMenuPaths(accessibleMenuItems.value));

function handleSelect(path: string) {
  router.push(path);
}

function collectParentMenuPaths(items: MenuItem[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: MenuItem[]) => {
    nodes.forEach((item) => {
      if (item.children?.length) {
        paths.push(item.path);
        walk(item.children);
      }
    });
  };
  walk(items);
  return paths;
}
</script>
