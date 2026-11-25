<template>
  <button
    ref="rootRef"
    type="button"
    class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400 transition hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-300 dark:border-slate-700 dark:bg-slate-800"
    :class="sizeClass"
    :aria-label="label"
    @click="emit('preview')"
  >
    <img v-if="src" :src="src" class="h-full w-full object-cover" :alt="label" @error="handleImageError" />
    <span v-else-if="loading" class="text-xs">加载中</span>
    <span v-else-if="failed" class="px-1 text-center text-xs">图片不可用</span>
    <span v-else class="text-xs">图片</span>
    <span v-if="badgeText" class="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-sm font-semibold text-white">
      {{ badgeText }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DailyTaskOrderMediaDescriptor } from '@/api/modules/dailyTasks';
import { getTaskOrderMediaAccess } from '@/composables/useTaskOrderMedia';
import { resolveAssetUrl } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    taskId?: string;
    participantId?: string;
    file?: DailyTaskOrderMediaDescriptor | null;
    legacyUrl?: string | null;
    size?: 'small' | 'large';
    badgeText?: string;
    label?: string;
  }>(),
  {
    size: 'small',
    badgeText: '',
    label: '查看图片'
  }
);

const emit = defineEmits<{
  preview: [];
}>();

const rootRef = ref<HTMLElement>();
const src = ref('');
const loading = ref(false);
const failed = ref(false);
let observer: IntersectionObserver | null = null;
let imageRetryCount = 0;

const sizeClass = computed(() => (props.size === 'large' ? 'h-24 w-24' : 'h-16 w-16'));

watch(
  () => [props.taskId, props.participantId, props.file?.fileId, props.legacyUrl] as const,
  () => {
    src.value = '';
    loading.value = false;
    failed.value = false;
    imageRetryCount = 0;
    observeOrLoad();
  }
);

onMounted(() => observeOrLoad());

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

function observeOrLoad() {
  observer?.disconnect();
  observer = null;

  if (typeof IntersectionObserver === 'undefined' || !rootRef.value) {
    void loadThumbnail();
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer?.disconnect();
      observer = null;
      void loadThumbnail();
    },
    { rootMargin: '160px 0px' }
  );
  observer.observe(rootRef.value);
}

async function loadThumbnail(force = false) {
  if (loading.value) return;
  const legacyUrl = resolveLegacyUrl(props.legacyUrl);
  if (legacyUrl) {
    src.value = legacyUrl;
    failed.value = false;
    return;
  }

  const fileId = props.file?.fileId?.trim();
  if (!fileId || !props.taskId || !props.participantId) {
    failed.value = true;
    return;
  }

  loading.value = true;
  failed.value = false;
  try {
    const access = await getTaskOrderMediaAccess(
      {
        taskId: props.taskId,
        participantId: props.participantId,
        fileId,
        variant: 'thumbnail'
      },
      { force }
    );
    src.value = access.url || access.fullUrl || '';
    failed.value = !src.value;
  } catch {
    src.value = '';
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

function handleImageError() {
  if (imageRetryCount >= 1 || !props.file?.fileId) {
    src.value = '';
    failed.value = true;
    return;
  }

  imageRetryCount += 1;
  void loadThumbnail(true);
}

function resolveLegacyUrl(value?: string | null) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /^tencent-cos:\/\//i.test(normalized)) return '';
  return resolveAssetUrl(normalized);
}
</script>
