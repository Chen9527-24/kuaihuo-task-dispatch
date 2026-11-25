<template>
  <el-dialog v-model="visible" title="任务派发链接" width="760px" destroy-on-close>
    <div class="space-y-4">
      <el-alert title="请复制以下任务内容并发送给执行同事" type="success" :closable="false" show-icon />

      <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-slate-600 dark:text-slate-300">任务文案</span>
          <el-button type="primary" plain @click="handleCopy">复制任务内容</el-button>
        </div>
        <el-input
          :model-value="dispatchContent"
          type="textarea"
          :autosize="{ minRows: 10, maxRows: 16 }"
          readonly
          resize="none"
        />
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { DailyTaskItem } from '@/api/modules/dailyTasks';
import { dispatchBaseUrl } from '@/config/env';

const props = defineProps<{
  modelValue: boolean;
  record: DailyTaskItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const cacheBustToken = ref(String(Date.now()));

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    refreshCacheBustToken();
  },
  { immediate: true }
);

const dispatchContent = computed(() => {
  const row = props.record;
  if (!row) return '';
  return buildDispatchContent(row, cacheBustToken.value);
});

function resolveCommentTotal(row: DailyTaskItem) {
  const commentList = Array.isArray(row.comment) ? row.comment : Array.isArray(row.comments) ? row.comments : [];
  const actualCommentCount = commentList.length;
  if (actualCommentCount > 0 && row.targetCommentCount !== actualCommentCount) {
    return actualCommentCount;
  }
  return row.targetCommentCount || actualCommentCount;
}

function buildDispatchContent(row: DailyTaskItem, cacheBustValue: string) {
  const accountName = row.mediaAccount?.accountName || row.mediaAccount?.accountId || '执行用户';
  const commentTotal = resolveCommentTotal(row);
  const taskLink = buildTaskLink(row, cacheBustValue);
  const platformLabel = resolvePlatformLabel(row);
  const lines = [
    `<${taskLink}>`,
    '',
    `【${accountName}】${row.title || '视频任务'}`,
    `平台：${platformLabel}`,
    `评论数：${commentTotal}`,
    row.commentRequirement || row.copywriting || '请打开任务链接查看要求，领取后按页面提示提交证明。'
  ];

  const videoAccountLink = resolveWechatVideoAccountLink(row, cacheBustValue);
  if (videoAccountLink) {
    lines.push('', '', '视频号链接：', `<${videoAccountLink}>`);
  }

  return lines.filter((line, index, arr) => {
    if (line) return true;
    return index > 0 && index < arr.length - 1;
  }).join('\n');
}

function buildTaskLink(row: DailyTaskItem, cacheBustValue: string) {
  const tenantsId = String(row.tenantId || row.tenant?.id || '').trim();
  const type = normalizePlatformType(row.platform);
  const postId = resolvePostId(row);
  const searchParams = new URLSearchParams({
    tenantsId,
    tenantId: tenantsId,
    taskId: row.id,
    type,
    postId,
    _t: cacheBustValue
  });
  return `${dispatchBaseUrl}/?${searchParams.toString()}`;
}

function refreshCacheBustToken() {
  cacheBustToken.value = String(Date.now());
}

function normalizePlatformType(platform: string | undefined) {
  const value = String(platform || '').trim().toLowerCase();
  return value || 'douyin';
}

function resolvePlatformValue(row: DailyTaskItem) {
  const platform = row.platform || row.mediaAccount?.platform || '';
  return String(platform).trim();
}

function resolvePlatformLabel(row: DailyTaskItem) {
  const platform = resolvePlatformValue(row);
  const normalized = platform.toUpperCase();
  const labelMap: Record<string, string> = {
    DOUYIN: '抖音',
    KUAISHOU: '快手',
    XIAOHONGSHU: '小红书',
    WECHAT: '微信',
    WECHAT_VIDEO: '微信视频号'
  };
  return labelMap[normalized] || platform || '视频平台';
}

function isWechatVideoTask(row: DailyTaskItem) {
  const platform = resolvePlatformValue(row).toUpperCase();
  return platform === 'WECHAT_VIDEO' || platform === 'WECHATVIDEO' || platform.includes('微信视频号');
}

function resolveWechatVideoAccountLink(row: DailyTaskItem, cacheBustValue: string) {
  if (!isWechatVideoTask(row)) return '';
  const links = collectVideoUrlValues(row);
  if (!links.length) return '';
  const index = pickStableIndex(links.length, cacheBustValue);
  return links[index];
}

function collectVideoUrlValues(row: DailyTaskItem) {
  const record = row as unknown as Record<string, unknown>;
  const values: string[] = [];
  appendUrlValue(values, record.videoUrl);
  return Array.from(new Set(values));
}

function appendUrlValue(target: string[], value: unknown) {
  if (Array.isArray(value)) {
    value.forEach((item) => appendUrlValue(target, item));
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    appendUrlValue(target, record.url);
    return;
  }
  if (typeof value !== 'string') return;
  const url = value.trim();
  if (url) target.push(url);
}

function pickStableIndex(length: number, seed: string) {
  if (length <= 1) return 0;
  const value = Number(seed);
  if (Number.isFinite(value)) return Math.abs(value) % length;
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % length;
}

function resolvePostId(row: DailyTaskItem) {
  const record = row as unknown as Record<string, unknown>;
  const keys = ['postId', 'videoId', 'awemeId', 'itemId', 'post_id', 'video_id'];

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return row.id;
}

async function handleCopy() {
  const row = props.record;
  if (!row) {
    ElMessage.warning('暂无可复制内容');
    return;
  }
  refreshCacheBustToken();
  const content = buildDispatchContent(row, cacheBustToken.value).trim();
  if (!content) {
    ElMessage.warning('暂无可复制内容');
    return;
  }
  try {
    await navigator.clipboard.writeText(content);
    ElMessage.success('已复制到剪贴板');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (copied) ElMessage.success('已复制到剪贴板');
    else ElMessage.info('可选中上方任务文案手动复制');
  }
}
</script>
