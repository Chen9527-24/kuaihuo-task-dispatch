<template>
  <el-breadcrumb separator="/" class="app-breadcrumb min-w-0">
    <el-breadcrumb-item v-for="item in breadcrumbItems" :key="item.path">
      <button
        v-if="item.clickable"
        class="truncate transition hover:text-[color:var(--app-theme-color)]"
        @click="router.push(item.path)"
      >
        {{ item.title }}
      </button>
      <span v-else class="truncate">{{ item.title }}</span>
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { findMenuItemByPath, getMenuPathChain, isLeafMenuPath } from '@/router/menu';

const route = useRoute();
const router = useRouter();

const breadcrumbItems = computed(() =>
  getMenuPathChain(route.path)
    .map((path) => {
      const menuItem = findMenuItemByPath(path);
      return {
        path,
        title: menuItem?.title ?? path,
        clickable: path !== route.path && isLeafMenuPath(path)
      };
    })
    .filter((item) => item.title)
);
</script>
