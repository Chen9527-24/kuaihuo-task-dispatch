import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import App from './App.vue';
import router from './router';
import './style.css';
import { ElMessage } from 'element-plus';
import { getRequestErrorMessage, setUnauthorizedHandler } from './api/core/http';
import { useAppStore } from './stores/app';
import { useAuthStore } from './stores/auth';
import { useSettingsStore } from './stores/settings';
import { useTabsStore } from './stores/tabs';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(ElementPlus, { locale: zhCn });

const settingsStore = useSettingsStore(pinia);
const appStore = useAppStore(pinia);
const tabsStore = useTabsStore(pinia);
const authStore = useAuthStore(pinia);

const UNHANDLED_ERROR_DEDUP_WINDOW_MS = 1500;
let lastUnhandledErrorMessage = '';
let lastUnhandledErrorAt = 0;

window.addEventListener('unhandledrejection', (event) => {
  const message = getRequestErrorMessage(event.reason);
  if (!message) return;

  const now = Date.now();
  if (
    message === lastUnhandledErrorMessage
    && now - lastUnhandledErrorAt < UNHANDLED_ERROR_DEDUP_WINDOW_MS
  ) return;

  lastUnhandledErrorMessage = message;
  lastUnhandledErrorAt = now;
  ElMessage.error({ message, grouping: true });
});

setUnauthorizedHandler(async () => {
  ElMessage.warning({
    message: '登录已过期，请重新登录',
    duration: 2000
  });

  await new Promise((resolve) => {
    window.setTimeout(resolve, 2000);
  });

  if (authStore.isLoggedIn) {
    await authStore.logout();
  } else {
    authStore.reset();
  }

  if (router.currentRoute.value.path !== '/login') {
    await router.replace('/login');
  }
});

settingsStore.applySettings();
appStore.hydrate();
tabsStore.hydrate();
authStore.hydrate();

app.use(router);

watch(
  () => settingsStore.$state,
  () => {
    settingsStore.persist();
    settingsStore.applySettings();
  },
  { deep: true, immediate: true }
);

watch(
  () => appStore.$state,
  () => {
    appStore.persist();
  },
  { deep: true, immediate: true }
);

watch(
  () => tabsStore.$state,
  () => {
    tabsStore.persist();
  },
  { deep: true, immediate: true }
);

watch(
  () => authStore.$state,
  () => {
    authStore.persist();
  },
  { deep: true, immediate: true }
);

// Account or tenant changes must not keep route tabs from the former context.
watch(
  () => authStore.contextVersion,
  (_next, previous) => {
    if (previous === undefined) return;
    tabsStore.resetForAuthContext();
  }
);

app.mount('#app');
