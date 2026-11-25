import { defineStore } from 'pinia';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { TabItem } from '@/types';

interface TabsState {
  tabs: TabItem[];
  favoritePaths: string[];
}

const STORAGE_KEY = 'kuaihuo-task-admin-tabs';

const defaultTab: TabItem = {
  title: '任务工作台',
  path: '/task-management',
  name: 'TaskManagementHome',
  closable: false
};

function loadState(): TabsState {
  if (typeof localStorage === 'undefined') {
    return {
      tabs: [defaultTab],
      favoritePaths: ['/daily-tasks']
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        tabs: [defaultTab],
        favoritePaths: ['/daily-tasks']
      };
    }
    const parsed = JSON.parse(raw) as Partial<TabsState>;
    return {
      tabs: parsed.tabs?.length ? parsed.tabs : [defaultTab],
      favoritePaths: parsed.favoritePaths ?? ['/daily-tasks']
    };
  } catch {
    return {
      tabs: [defaultTab],
      favoritePaths: ['/daily-tasks']
    };
  }
}

export const useTabsStore = defineStore('tabs', {
  state: (): TabsState => ({
    tabs: [defaultTab],
    favoritePaths: ['/daily-tasks']
  }),
  getters: {
    hasFavorite: (state) => (path: string) => state.favoritePaths.includes(path)
  },
  actions: {
    hydrate() {
      Object.assign(this, loadState());
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
    },
    visit(route: RouteLocationNormalizedLoaded) {
      const path = route.path;
      const title = String(route.meta.title ?? route.name ?? path);
      const name = String(route.name ?? path);
      const closable = Boolean(route.meta.closable ?? path !== '/task-management');

      if (!this.tabs.some((tab) => tab.path === path)) {
        this.tabs.push({ path, title, name, closable });
      }
    },
    close(path: string) {
      this.tabs = this.tabs.filter((tab) => tab.path !== path || !tab.closable);
    },
    closeOthers(path: string) {
      this.tabs = this.tabs.filter((tab) => tab.path === path || !tab.closable);
    },
    closeAll() {
      this.tabs = this.tabs.filter((tab) => !tab.closable);
    },
    /** Clear route instances tied to the previous account or tenant context. */
    resetForAuthContext() {
      this.tabs = [{ ...defaultTab }];
    },
    toggleFavorite(path: string) {
      if (this.favoritePaths.includes(path)) {
        this.favoritePaths = this.favoritePaths.filter((item) => item !== path);
        return;
      }
      this.favoritePaths.unshift(path);
    }
  }
});
