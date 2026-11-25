<template>
  <section class="panel-surface p-5 shadow-panel">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="text-base font-semibold">{{ title }}</div>
        <div v-if="description" class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ description }}</div>
      </div>
      <div class="flex flex-wrap gap-2">
        <slot name="actions" />
      </div>
    </div>

    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>
