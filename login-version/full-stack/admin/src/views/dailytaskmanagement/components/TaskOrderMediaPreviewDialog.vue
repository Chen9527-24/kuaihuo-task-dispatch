<template>
  <el-dialog v-model="visible" title="图片预览" width="min(960px, calc(100vw - 32px))" destroy-on-close append-to-body>
    <div v-if="currentSource" class="space-y-4">
      <div class="flex min-h-[360px] items-center justify-center rounded-2xl bg-slate-50 p-3 dark:bg-slate-900">
        <img v-if="imageUrl" :src="imageUrl" class="max-h-[68vh] max-w-full rounded-xl object-contain" alt="图片预览" @error="handleImageError" />
        <span v-else-if="loading" class="text-sm text-slate-500">正在加载原图…</span>
        <span v-else class="text-sm text-slate-500">图片不可用或已删除</span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <div class="text-sm text-slate-500">{{ sources.length ? `${currentIndex + 1} / ${sources.length}` : '' }}</div>
        <div class="flex gap-2">
          <el-button :disabled="currentIndex <= 0" @click="move(-1)">上一张</el-button>
          <el-button :disabled="currentIndex >= sources.length - 1" @click="move(1)">下一张</el-button>
          <el-button :loading="loading" @click="loadCurrent(true)">重新加载</el-button>
        </div>
      </div>
    </div>
    <el-empty v-else description="暂无可预览图片" />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { TaskOrderPreviewSource } from './taskOrderMedia.types';
import { getTaskOrderMediaAccess } from '@/composables/useTaskOrderMedia';
import { resolveAssetUrl } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    taskId?: string;
    participantId?: string;
    sources?: TaskOrderPreviewSource[];
    initialIndex?: number;
  }>(),
  {
    sources: () => [],
    initialIndex: 0
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const loading = ref(false);
const imageUrl = ref('');
const currentIndex = ref(0);
const retryCount = ref(0);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const sources = computed(() => props.sources ?? []);
const currentSource = computed(() => sources.value[currentIndex.value] ?? null);

watch(
  () => [props.modelValue, props.initialIndex, props.taskId, props.participantId, props.sources] as const,
  ([open]) => {
    if (!open) {
      imageUrl.value = '';
      return;
    }
    currentIndex.value = normalizeIndex(props.initialIndex);
    retryCount.value = 0;
    void loadCurrent();
  },
  { deep: true }
);

function move(offset: number) {
  const next = Math.min(Math.max(currentIndex.value + offset, 0), Math.max(sources.value.length - 1, 0));
  if (next === currentIndex.value) return;
  currentIndex.value = next;
  retryCount.value = 0;
  void loadCurrent();
}

async function loadCurrent(force = false) {
  const source = currentSource.value;
  imageUrl.value = '';
  if (!source) return;

  const legacyUrl = resolveLegacyUrl(source.legacyUrl);
  if (legacyUrl) {
    imageUrl.value = legacyUrl;
    return;
  }

  const fileId = source.file?.fileId?.trim();
  if (!fileId || !props.taskId || !props.participantId) return;

  loading.value = true;
  try {
    const access = await getTaskOrderMediaAccess(
      {
        taskId: props.taskId,
        participantId: props.participantId,
        fileId,
        variant: 'original'
      },
      { force }
    );
    imageUrl.value = access.url || access.fullUrl || '';
  } catch {
    imageUrl.value = '';
  } finally {
    loading.value = false;
  }
}

function handleImageError() {
  if (retryCount.value >= 1 || !currentSource.value?.file?.fileId) {
    imageUrl.value = '';
    return;
  }
  retryCount.value += 1;
  void loadCurrent(true);
}

function normalizeIndex(index?: number) {
  const maxIndex = Math.max(sources.value.length - 1, 0);
  const value = Number.isFinite(index) ? Number(index) : 0;
  return Math.min(Math.max(value, 0), maxIndex);
}

function resolveLegacyUrl(value?: string | null) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /^tencent-cos:\/\//i.test(normalized)) return '';
  return resolveAssetUrl(normalized);
}
</script>
