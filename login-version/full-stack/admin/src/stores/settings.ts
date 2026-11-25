import { defineStore } from 'pinia';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface SettingsState {
  themeMode: ThemeMode;
  themeColor: string;
  radius: number;
  fixedHeader: boolean;
  showTabs: boolean;
  showQuickNav: boolean;
}

const STORAGE_KEY = 'kuaihuo-task-admin-settings';

const defaultState: SettingsState = {
  themeMode: 'light',
  themeColor: '#16a34a',
  radius: 18,
  fixedHeader: true,
  showTabs: true,
  showQuickNav: true
};

function loadState(): SettingsState {
  if (typeof localStorage === 'undefined') {
    return defaultState;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => loadState(),
  actions: {
    setThemeMode(mode: ThemeMode) {
      this.themeMode = mode;
    },
    setThemeColor(color: string) {
      this.themeColor = color;
    },
    setRadius(radius: number) {
      this.radius = radius;
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.$state));
    },
    applySettings() {
      const root = document.documentElement;
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = this.themeMode === 'dark' || (this.themeMode === 'system' && prefersDark);

      root.classList.toggle('dark', isDark);
      root.style.setProperty('--el-color-primary', this.themeColor);
      root.style.setProperty('--app-radius', `${this.radius}px`);
      root.style.setProperty('--app-theme-color', this.themeColor);
    }
  }
});
