<template>
  <el-dialog v-model="visible" title="评论集" width="980px" destroy-on-close>
    <div class="space-y-3">
      <div v-if="!isReadonly" class="flex flex-wrap items-center gap-2">
        <el-button type="primary" plain @click="openImport">导入</el-button>
        <el-button plain :disabled="!commentRows.length" @click="handleExport">导出</el-button>
        <el-button plain @click="handleDownloadTemplate">模板下载</el-button>
        <el-button type="success" plain @click="aiConfigDrawerVisible = true">AI生成</el-button>
        <el-button plain :disabled="!commentRows.length" @click="toggleSelectAllComments">
          {{ allCommentsSelected ? '取消全选' : '全选' }}
        </el-button>
        <el-button type="danger" plain :disabled="!selectedCommentIds.length" @click="removeSelectedComments">批量删除</el-button>
        <el-button plain @click="appendComment">新增一条</el-button>
        <span class="text-xs text-slate-500">共 {{ commentRows.length }} 条</span>
        <span class="text-xs" :class="isAiConfigComplete ? 'text-emerald-600' : 'text-amber-600'">{{ aiConfigStatusText }}</span>
      </div>

      <input ref="fileInputRef" type="file" accept=".xlsx,.xls" class="hidden" @change="handleImport" />

      <el-table
        ref="commentTableRef"
        :data="commentRows"
        row-key="id"
        max-height="460"
        stripe
        @selection-change="onCommentSelectionChange"
      >
        <el-table-column v-if="!isReadonly" type="selection" width="50" />
        <el-table-column label="#" width="60">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column prop="text" label="评论文本" min-width="600">
          <template #default="{ row }">
            <el-input
              v-if="!isReadonly"
              v-model="row.text"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 3 }"
              resize="none"
              placeholder="请输入评论内容"
            />
            <div v-else class="whitespace-pre-wrap break-words leading-6 text-slate-700 dark:text-slate-200">
              {{ row.text || '--' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="!isReadonly" label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeComment(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <template v-if="!isReadonly" #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>

  <AiCommentConfigDrawer v-model="aiConfigDrawerVisible" :config="aiConfigDraft" @save="handleAiConfigSave" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { TableInstance } from 'element-plus';
import type { AiGenerateFormModel } from '../types';
import { downloadCommentTemplate, exportCommentsByTemplate, importCommentsFromExcel } from '../commentTemplate';
import AiCommentConfigDrawer from './AiCommentConfigDrawer.vue';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  comments: string[];
  aiConfig: AiGenerateFormModel;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [comments: string[]];
  'update:aiConfig': [config: AiGenerateFormModel];
}>();

const AI_CONFIG_REQUIRED_FIELDS: Array<keyof AiGenerateFormModel> = [
  'messageContent',
  'count',
  'videoTitle',
  'videoUrl',
  'videoContent',
  'accountPositioning',
  'videoStyle',
  'videoScript',
  'targetAudience',
  'audiencePainPoint',
  'operationGoal',
  'platform',
  'customSystemPrompt',
  'customUserPrompt'
];

const commentTableRef = ref<TableInstance>();
const fileInputRef = ref<HTMLInputElement>();
const commentRows = ref<Array<{ id: string; text: string }>>([]);
const selectedCommentIds = ref<string[]>([]);
const aiConfigDrawerVisible = ref(false);
const aiConfigDraft = ref<AiGenerateFormModel>(cloneAiConfig(props.aiConfig));

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const isReadonly = computed(() => props.mode === 'edit');
const allCommentsSelected = computed(() => commentRows.value.length > 0 && selectedCommentIds.value.length === commentRows.value.length);
const completedAiConfigCount = computed(() => AI_CONFIG_REQUIRED_FIELDS.filter((field) => isAiConfigFieldFilled(aiConfigDraft.value[field])).length);
const isAiConfigComplete = computed(() => completedAiConfigCount.value === AI_CONFIG_REQUIRED_FIELDS.length);
const aiConfigStatusText = computed(() => {
  return isAiConfigComplete.value
    ? `AI 配置已完成（${completedAiConfigCount.value}/${AI_CONFIG_REQUIRED_FIELDS.length}）`
    : `AI 配置未完成（${completedAiConfigCount.value}/${AI_CONFIG_REQUIRED_FIELDS.length}）`;
});

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    commentRows.value = props.comments.map((text) => ({ id: createCommentId(), text }));
    selectedCommentIds.value = [];
    aiConfigDraft.value = cloneAiConfig(props.aiConfig);
  }
);

function handleSave() {
  const texts = uniq(commentRows.value.map((item) => item.text.trim()).filter(Boolean));
  emit('save', texts);
  visible.value = false;
}

function onCommentSelectionChange(rows: Array<{ id: string }>) {
  selectedCommentIds.value = rows.map((item) => item.id);
}

function toggleSelectAllComments() {
  if (!commentTableRef.value) return;
  if (allCommentsSelected.value) {
    commentTableRef.value.clearSelection();
    return;
  }
  commentRows.value.forEach((row) => {
    commentTableRef.value?.toggleRowSelection(row, true);
  });
}

function removeSelectedComments() {
  if (!selectedCommentIds.value.length) return;
  const selected = new Set(selectedCommentIds.value);
  commentRows.value = commentRows.value.filter((row) => !selected.has(row.id));
  selectedCommentIds.value = [];
}

function removeComment(id: string) {
  commentRows.value = commentRows.value.filter((row) => row.id !== id);
}

function appendComment() {
  commentRows.value.push({
    id: createCommentId(),
    text: ''
  });
}

function openImport() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement;
  const [file] = target.files ?? [];
  if (!file) return;

  try {
    const texts = await importCommentsFromExcel(file);
    if (!texts.length) {
      ElMessage.warning('未读取到可用评论内容');
      return;
    }
    mergeCommentTexts(texts);
    ElMessage.success(`导入成功，共 ${texts.length} 条`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败，请检查文件格式';
    ElMessage.error(message);
  }
}

async function handleExport() {
  try {
    const texts = commentRows.value.map((item) => item.text.trim()).filter(Boolean);
    await exportCommentsByTemplate(texts);
    ElMessage.success('导出成功');
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出失败';
    ElMessage.error(message);
  }
}

async function handleDownloadTemplate() {
  try {
    await downloadCommentTemplate();
    ElMessage.success('模板下载已开始');
  } catch (error) {
    const message = error instanceof Error ? error.message : '模板下载失败';
    ElMessage.error(message);
  }
}

function handleAiConfigSave(payload: { config: AiGenerateFormModel; generatedItems: Array<{ commentText: string; type?: string; replies: string[] }> }) {
  const nextConfig = cloneAiConfig(payload.config);
  aiConfigDraft.value = nextConfig;
  emit('update:aiConfig', nextConfig);
  const beforeCount = commentRows.value.length;
  mergeCommentTexts(payload.generatedItems.map((item) => item.commentText));
  const addedCount = commentRows.value.length - beforeCount;
  ElMessage.success(`AI生成结果已导入评论集，新增 ${addedCount} 条评论`);
}

function mergeCommentTexts(texts: string[]) {
  const exists = new Set(commentRows.value.map((item) => item.text.trim()));
  const append = texts
    .map((text) => text.trim())
    .filter((text) => text && !exists.has(text))
    .map((text) => ({ id: createCommentId(), text }));
  commentRows.value = [...commentRows.value, ...append];
}

function createCommentId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function uniq(items: string[]) {
  const cache = new Set<string>();
  const result: string[] = [];
  items.forEach((item) => {
    const text = item.trim();
    if (!text || cache.has(text)) return;
    cache.add(text);
    result.push(text);
  });
  return result;
}

function isAiConfigFieldFilled(value: string | number | boolean) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }
  return typeof value === 'boolean' || Boolean(value.trim());
}

function cloneAiConfig(config: AiGenerateFormModel): AiGenerateFormModel {
  return {
    messageContent: config.messageContent || '',
    useConversationContext: Boolean(config.useConversationContext),
    count: config.count || 5,
    videoTitle: config.videoTitle || '',
    videoUrl: config.videoUrl || '',
    videoContent: config.videoContent || '',
    accountPositioning: config.accountPositioning || '',
    videoStyle: config.videoStyle || '',
    videoScript: config.videoScript || '',
    targetAudience: config.targetAudience || '',
    audiencePainPoint: config.audiencePainPoint || '',
    operationGoal: config.operationGoal || '',
    platform: config.platform || '',
    customSystemPrompt: config.customSystemPrompt || '',
    customUserPrompt: config.customUserPrompt || ''
  };
}
</script>
