<template>
  <div class="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div class="text-sm text-slate-500 dark:text-slate-400">{{ summaryText }}</div>
    <el-pagination
      v-model:current-page="currentPageModel"
      v-model:page-size="pageSizeModel"
      :page-sizes="pageSizes"
      background
      layout="total, sizes, prev, pager, next"
      :total="total"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    currentPage: number;
    pageSize: number;
    total: number;
    pageSizes?: number[];
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100, 200, 500, 1000]
  }
);

const emit = defineEmits<{
  'update:currentPage': [value: number];
  'update:pageSize': [value: number];
}>();

const currentPageModel = computed({
  get: () => props.currentPage,
  set: (value: number) => emit('update:currentPage', value)
});

const pageSizeModel = computed({
  get: () => props.pageSize,
  set: (value: number) => emit('update:pageSize', value)
});

const summaryText = computed(
  () => `当前第 ${props.currentPage} 页，每页 ${props.pageSize} 条，共 ${props.total} 条`
);
</script>
