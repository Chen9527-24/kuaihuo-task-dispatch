<template>
  <div class="app-layout-shell h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div class="flex h-full overflow-hidden">
      <AppSidebar />
      <div class="relative flex min-w-0 flex-1 overflow-hidden">
        <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            :class="[
              'app-layout-header z-20 shrink-0 px-4 pt-4 transition-all',
              settings.fixedHeader
                ? 'sticky top-0 bg-slate-100/92 backdrop-blur dark:bg-slate-950/88'
                : ''
            ]"
          >
            <AppHeader />
            <AppTabs v-if="settings.showTabs" class="mt-3" />
          </div>

          <main class="app-layout-main min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 app-scrollbar">
            <RouterView v-slot="{ Component, route }">
              <transition name="fade-slide" mode="out-in">
                <KeepAlive :include="keepAliveRouteNames" :max="keepAliveCacheMax">
                  <component
                    v-if="Component"
                    :is="Component"
                    :key="route.meta.keepAlive ? keepAliveCacheKey(route) : route.fullPath"
                  />
                </KeepAlive>
              </transition>
            </RouterView>
          </main>
        </div>

        <QuickNavDrawer v-if="settings.showQuickNav" />
      </div>
    </div>

    <SettingsDrawer />
  </div>
</template>

<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue';
import AppHeader from '@/components/AppHeader.vue';
import AppTabs from '@/components/AppTabs.vue';
import QuickNavDrawer from '@/components/QuickNavDrawer.vue';
import SettingsDrawer from '@/components/SettingsDrawer.vue';
import { useSettingsStore } from '@/stores/settings';
import { useAuthStore } from '@/stores/auth';
import { reactive, watch } from 'vue';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import { cachedViewDataRevision } from '@/runtime/dataFreshness';

const settings = useSettingsStore();
const auth = useAuthStore();
const router = useRouter();
const currentRoute = useRoute();
// Read cache metadata from the installed router instead of importing the router
// module back into the layout, which would create an HMR-sensitive import cycle.
const keepAliveRouteNames = router
  .getRoutes()
  .filter((route) => route.meta.keepAlive && route.name)
  .map((route) => String(route.name));
const keepAliveCacheMax = Math.max(keepAliveRouteNames.length + 4, 8);
const routeDataRevisions = reactive<Record<string, number>>({});

function routeIdentity(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path'>) {
  return String(route.name ?? route.path);
}

function keepAliveCacheKey(route: RouteLocationNormalizedLoaded) {
  const identity = routeIdentity(route);
  const dataRevision = routeDataRevisions[identity] ?? 0;
  return `${identity}-${auth.contextVersion}-data-${dataRevision}`;
}

watch(
  () => routeIdentity(currentRoute),
  (identity) => {
    if (!currentRoute.meta.keepAlive) return;
    // Snapshot only on route activation. A save on the current page must not
    // destroy its own form/component; cached sibling pages will remount when
    // the user navigates to them and therefore fetch current server data.
    routeDataRevisions[identity] = cachedViewDataRevision.value;
  },
  { immediate: true, flush: 'pre' },
);
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
