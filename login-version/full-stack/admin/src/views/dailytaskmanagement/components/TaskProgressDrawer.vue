<template>
  <el-drawer v-model="visible" title="参与进度明细" size="720px">
    <div v-loading="loading" class="space-y-4">
      <section class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
          <div class="text-xs text-slate-500">目标评论</div>
          <div class="mt-2 text-xl font-semibold">{{ progress?.targetCommentCount ?? 0 }}</div>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
          <div class="text-xs text-slate-500">已领取</div>
          <div class="mt-2 text-xl font-semibold">{{ progress?.claimedCommentCount ?? 0 }}</div>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
          <div class="text-xs text-slate-500">已完成</div>
          <div class="mt-2 text-xl font-semibold">{{ progress?.completedCommentCount ?? 0 }}</div>
        </div>
        <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
          <div class="text-xs text-slate-500">完成率</div>
          <div class="mt-2 text-xl font-semibold">{{ progress?.completionRate ?? 0 }}%</div>
        </div>
      </section>

      <el-table :data="progress?.details ?? []" stripe>
        <el-table-column prop="content" label="评论内容" min-width="260" show-overflow-tooltip />
        <el-table-column label="领取人" min-width="130">
          <template #default="{ row }">{{ row.assignee?.displayName || row.assignee?.username || '--' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="{ row }"><DictTag :value="row.status" :options="commentStatusOptions" /></template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import * as dailyTasksApi from '@/api/modules/dailyTasks';
import type { TaskProgress } from '@/api/modules/dailyTasks';
import DictTag from '@/components/common/DictTag.vue';
import type { SelectOption } from '@/utils/apiData';
import { formatDateTime } from '@/utils/format';

const props = defineProps<{
  modelValue: boolean;
  taskId?: string;
  commentStatusOptions: SelectOption[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const loading = ref(false);
const progress = ref<TaskProgress | null>(null);

const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.taskId) loadProgress();
  }
);

async function loadProgress() {
  if (!props.taskId) return;
  loading.value = true;
  try {
    progress.value = await dailyTasksApi.getDailyTaskProgress(props.taskId);
  } finally {
    loading.value = false;
  }
}
</script>
