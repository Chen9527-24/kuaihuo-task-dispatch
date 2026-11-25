<template>
  <div v-if="sources.length" class="flex flex-wrap gap-3">
    <TaskOrderMediaThumbnail
      v-for="(source, index) in displayedSources"
      :key="source.key"
      :task-id="taskId"
      :participant-id="participantId"
      :file="source.file"
      :legacy-url="source.legacyUrl"
      :size="size"
      :badge-text="index === displayedSources.length - 1 && remainingCount > 0 ? `+${remainingCount}` : ''"
      :label="`查看图片 ${index + 1}`"
      @preview="emit('preview', { sources, initialIndex: index })"
    />
  </div>
  <span v-else class="text-slate-400">{{ emptyText }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DailyTaskOrderMediaDescriptor } from '@/api/modules/dailyTasks';
import TaskOrderMediaThumbnail from './TaskOrderMediaThumbnail.vue';
import type { TaskOrderPreviewSource } from './taskOrderMedia.types';

interface MediaSource extends TaskOrderPreviewSource {
  key: string;
}

const props = withDefaults(
  defineProps<{
    taskId?: string;
    participantId?: string;
    files?: DailyTaskOrderMediaDescriptor[] | null;
    legacyUrls?: Array<string | null | undefined> | null;
    maxVisible?: number;
    size?: 'small' | 'large';
    emptyText?: string;
  }>(),
  {
    files: () => [],
    legacyUrls: () => [],
    maxVisible: 1,
    size: 'small',
    emptyText: '暂无'
  }
);

const emit = defineEmits<{
  preview: [payload: { sources: TaskOrderPreviewSource[]; initialIndex: number }];
}>();

const sources = computed<MediaSource[]>(() => {
  const fileSources = (props.files ?? [])
    .filter((file): file is DailyTaskOrderMediaDescriptor => Boolean(file?.fileId?.trim()))
    .map((file) => ({ file, key: `file:${file.fileId}` }));

  const legacySources = (props.legacyUrls ?? [])
    .map((url) => String(url ?? '').trim())
    .filter((url) => Boolean(url) && !/^tencent-cos:\/\//i.test(url))
    .map((legacyUrl) => ({ legacyUrl, key: `legacy:${legacyUrl}` }));

  return [...fileSources, ...legacySources].filter(
    (source, index, list) => list.findIndex((item) => item.key === source.key) === index
  );
});

const displayedSources = computed(() => {
  if (props.maxVisible <= 0) return sources.value;
  return sources.value.slice(0, props.maxVisible);
});

const remainingCount = computed(() => Math.max(0, sources.value.length - displayedSources.value.length));
</script>
