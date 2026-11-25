<template>
  <el-drawer v-model="visible" title="任务评论配置" :size="drawerSize" class="task-comments-drawer">
    <div v-loading="loading" class="task-comments-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div class="sticky top-0 z-10 mb-4 shrink-0 border-b border-slate-200 bg-white pb-4 dark:border-slate-700 dark:bg-[var(--el-bg-color)]">
        <div class="flex flex-wrap items-center gap-2">
          <el-button v-if="can('daily-task:comment:create')" type="primary" plain @click="openImport">导入</el-button>
          <el-button type="info" plain :disabled="!comments.length" @click="handleExport">导出</el-button>
          <el-button plain @click="handleDownloadTemplate">模板下载</el-button>
          <el-button v-if="canGenerateAiComments" type="success" plain @click="aiDialogVisible = true">AI生成</el-button>
          <el-button v-if="can('daily-task:comment:delete')" type="warning" plain :disabled="!selectableComments.length" @click="toggleSelectAllComments">
            {{ allCommentsSelected ? '取消全选' : '全选' }}
          </el-button>
          <el-button v-if="can('daily-task:comment:delete')" type="danger" plain :disabled="!selectedIds.length" @click="batchRemove">批量删除</el-button>
          <el-button v-if="can('daily-task:comment:create')" type="primary" @click="appendComment">新增一条</el-button>
          <span class="text-xs text-slate-500">显示 {{ displayedComments.length }} / 共 {{ comments.length }} 条</span>
        </div>
      </div>

      <input ref="fileInputRef" type="file" accept=".xlsx,.xls" class="hidden" @change="handleImport" />

      <div class="min-h-0 flex-1">
        <el-table
          ref="commentTableRef"
          :data="displayedComments"
          row-key="id"
          stripe
          height="100%"
          class="task-comments-table"
          @selection-change="onSelectionChange"
        >
          <el-table-column v-if="can('daily-task:comment:delete')" type="selection" width="44" align="center" header-align="center" :selectable="isRowSelectable" />
          <el-table-column label="#" width="56" align="center" header-align="center">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="content" label="评论文本" min-width="220" align="center" header-align="center">
            <template #default="{ row }">
              <div class="comment-content-cell">
                <el-input
                  v-if="editingId === row.id"
                  v-model="editingContent"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                  resize="none"
                  placeholder="请输入评论内容"
                />
                <div v-else class="whitespace-pre-wrap break-words text-center leading-6">{{ row.content || '--' }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="source" label="来源" width="96" align="center" header-align="center">
            <template #default="{ row }">
              <el-select v-if="editingId === row.id" v-model="editingSource" size="small">
                <el-option v-for="item in sourceOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <DictTag v-else :value="row.source" :options="sourceOptions" />
            </template>
          </el-table-column>
          <el-table-column prop="status" width="110" align="center" header-align="center">
            <template #header>
              <div class="flex items-center justify-center gap-1">
                <span>状态</span>
                <el-popover placement="bottom" trigger="click" :width="180">
                  <div class="flex flex-col gap-2">
                    <el-radio-group v-model="statusFilter" class="!flex !flex-col !items-start gap-2">
                      <el-radio label="">全部</el-radio>
                      <el-radio v-for="item in commentStatusOptions" :key="item.value" :label="item.value">
                        {{ item.label }}
                      </el-radio>
                    </el-radio-group>
                  </div>
                  <template #reference>
                    <el-button link :type="statusFilter ? 'primary' : undefined" class="!min-h-0 !p-0">
                      <el-icon><Filter /></el-icon>
                    </el-button>
                  </template>
                </el-popover>
              </div>
            </template>
            <template #default="{ row }">
              <el-select v-if="editingId === row.id" v-model="editingStatus" size="small">
                <el-option v-for="item in commentStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
              <DictTag v-else :value="row.status" :options="commentStatusOptions" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="132" align="center" header-align="center">
            <template #default="{ row }">
              <template v-if="editingId === row.id">
                <el-button v-if="canSaveEdit(row)" link type="primary" @click="saveEdit(row)">保存</el-button>
                <el-button link @click="cancelEdit">取消</el-button>
              </template>
              <template v-else>
                <el-button v-if="canEditComment(row)" link type="warning" :disabled="!isCommentEditable(row)" @click="startEdit(row)">编辑</el-button>
                <el-button v-if="can('daily-task:comment:delete')" link type="danger" :disabled="!isCommentEditable(row)" @click="removeComment(row)">删除</el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <TaskCommentAiDialog v-model="aiDialogVisible" @confirm="handleAiImport" />
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { TableInstance } from 'element-plus';
import { Filter } from '@element-plus/icons-vue';
import * as dailyTasksApi from '@/api/modules/dailyTasks';
import type { TaskCommentItem } from '@/api/modules/dailyTasks';
import DictTag from '@/components/common/DictTag.vue';
import type { SelectOption } from '@/utils/apiData';
import { downloadCommentTemplate, exportCommentsByTemplate, importCommentsFromExcel } from '../commentTemplate';
import TaskCommentAiDialog from './TaskCommentAiDialog.vue';
import { useAuthStore } from '@/stores/auth';

type TaskCommentRow = TaskCommentItem & { isDraft?: boolean };

const props = defineProps<{
  modelValue: boolean;
  taskId?: string;
  commentStatusOptions: SelectOption[];
  sourceOptions: SelectOption[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});
const drawerSize = 'min(1680px, 100vw)';
const auth = useAuthStore();

function can(permission: string) {
  return auth.isPlatformAdmin || auth.user.permissions.includes(permission);
}

const canGenerateAiComments = computed(() => can('daily-task:comment:ai-generate') && can('daily-task:comment:create'));

function canEditComment(row: TaskCommentRow) {
  return can(row.isDraft || isDraftId(row.id) ? 'daily-task:comment:create' : 'daily-task:comment:update');
}

function canSaveEdit(row: TaskCommentRow) {
  return canEditComment(row);
}

const commentTableRef = ref<TableInstance>();
const fileInputRef = ref<HTMLInputElement>();
const loading = ref(false);
const aiDialogVisible = ref(false);
const comments = ref<TaskCommentRow[]>([]);
const selectedIds = ref<string[]>([]);
const editingId = ref('');
const editingContent = ref('');
const editingStatus = ref('AVAILABLE');
const editingSource = ref('MANUAL');
const statusFilter = ref('');

const displayedComments = computed(() =>
  statusFilter.value ? comments.value.filter((item) => item.status === statusFilter.value) : comments.value
);
const selectableComments = computed(() => displayedComments.value.filter((item) => isRowSelectable(item)));
const allCommentsSelected = computed(
  () => selectableComments.value.length > 0 && selectableComments.value.every((item) => selectedIds.value.includes(item.id))
);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    resetEditingState();
    statusFilter.value = '';
    clearSelection();
    if (props.taskId) {
      loadComments();
    }
  }
);

watch(statusFilter, () => {
  clearSelection();
});

async function loadComments() {
  if (!props.taskId) return;
  loading.value = true;
  try {
    comments.value = await dailyTasksApi.listTaskComments(props.taskId);
    clearSelection();
  } finally {
    loading.value = false;
  }
}

function onSelectionChange(rows: Array<{ id: string }>) {
  selectedIds.value = rows.map((item) => item.id);
}

function toggleSelectAllComments() {
  if (!commentTableRef.value) return;
  if (allCommentsSelected.value) {
    commentTableRef.value.clearSelection();
    return;
  }
  selectableComments.value.forEach((row) => {
    commentTableRef.value?.toggleRowSelection(row, true);
  });
}

function appendComment() {
  if (!can('daily-task:comment:create')) {
    ElMessage.warning('当前角色没有新增任务评论权限');
    return;
  }
  if (editingId.value) {
    ElMessage.warning('请先保存或取消当前编辑内容');
    return;
  }
  const row: TaskCommentRow = {
    id: createDraftId(),
    content: '',
    source: 'MANUAL',
    status: 'AVAILABLE',
    isDraft: true
  };
  comments.value = [row, ...comments.value];
  startEdit(row);
}

function startEdit(row: TaskCommentRow) {
  if (!canEditComment(row)) {
    ElMessage.warning('当前角色没有编辑任务评论权限');
    return;
  }
  if (!isCommentEditable(row)) {
    ElMessage.warning('只有可领取状态的评论才支持编辑');
    return;
  }
  editingId.value = row.id;
  editingContent.value = row.content || '';
  editingStatus.value = row.status || 'AVAILABLE';
  editingSource.value = row.source || 'MANUAL';
}

function cancelEdit() {
  if (isDraftId(editingId.value)) {
    comments.value = comments.value.filter((item) => item.id !== editingId.value);
  }
  resetEditingState();
}

async function saveEdit(row: TaskCommentRow) {
  if (!canSaveEdit(row)) {
    ElMessage.warning('当前角色没有保存任务评论的权限');
    return;
  }
  if (!props.taskId) return;
  const content = editingContent.value.trim();
  if (!content) {
    ElMessage.warning('请输入评论内容');
    return;
  }

  const payload = {
    content,
    status: editingStatus.value || 'AVAILABLE',
    source: editingSource.value || 'MANUAL'
  };

  if (row.isDraft || isDraftId(row.id)) {
    await dailyTasksApi.createTaskComment(props.taskId, payload);
    ElMessage.success('评论已添加');
  } else {
    await dailyTasksApi.updateTaskComment(props.taskId, row.id, payload);
    ElMessage.success('评论已更新');
  }

  resetEditingState();
  emit('changed');
  await loadComments();
}

async function removeComment(row: TaskCommentRow) {
  if (!can('daily-task:comment:delete')) {
    ElMessage.warning('当前角色没有删除任务评论权限');
    return;
  }
  if (!isCommentEditable(row)) {
    ElMessage.warning('只有可领取状态的评论才支持删除');
    return;
  }
  if (row.isDraft || isDraftId(row.id)) {
    comments.value = comments.value.filter((item) => item.id !== row.id);
    if (editingId.value === row.id) resetEditingState();
    return;
  }
  if (!props.taskId) return;
  await ElMessageBox.confirm('确认删除这条评论？', '删除确认', { type: 'warning' });
  await dailyTasksApi.removeTaskComment(props.taskId, row.id);
  ElMessage.success('评论已删除');
  emit('changed');
  await loadComments();
}

async function batchRemove() {
  if (!can('daily-task:comment:delete')) {
    ElMessage.warning('当前角色没有删除任务评论权限');
    return;
  }
  if (!selectedIds.value.length) return;
  const draftIds = selectedIds.value.filter((id) => isDraftId(id));
  const persistedIds = selectedIds.value.filter((id) => !isDraftId(id));
  await ElMessageBox.confirm(`确认删除选中的 ${selectedIds.value.length} 条评论？`, '批量删除', { type: 'warning' });

  if (draftIds.length) {
    comments.value = comments.value.filter((item) => !draftIds.includes(item.id));
  }
  if (props.taskId && persistedIds.length) {
    await dailyTasksApi.batchRemoveTaskComments(props.taskId, persistedIds);
  }

  selectedIds.value = [];
  resetEditingState();
  ElMessage.success('评论已批量删除');
  emit('changed');
  await loadComments();
}

function openImport() {
  if (!can('daily-task:comment:create')) {
    ElMessage.warning('当前角色没有新增任务评论权限');
    return;
  }
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

async function handleImport(event: Event) {
  if (!can('daily-task:comment:create')) return;
  const target = event.target as HTMLInputElement;
  const [file] = target.files ?? [];
  if (!file) return;

  try {
    const texts = await importCommentsFromExcel(file);
    if (!texts.length) {
      ElMessage.warning('未读取到可用评论内容');
      return;
    }
    const addedCount = await createCommentsByTexts(texts, 'IMPORT');
    if (!addedCount) {
      ElMessage.warning('导入内容与现有评论重复，未新增评论');
      return;
    }
    ElMessage.success(`导入成功，新增 ${addedCount} 条评论`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败，请检查文件格式';
    ElMessage.error(message);
  }
}

async function handleExport() {
  try {
    const texts = comments.value.map((item) => normalizeText(item.content)).filter(Boolean);
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

async function handleAiImport(texts: string[]) {
  if (!canGenerateAiComments.value) return;
  const addedCount = await createCommentsByTexts(texts, 'AI');
  if (!addedCount) {
    ElMessage.warning('AI生成结果与现有评论重复，未新增评论');
    return;
  }
  ElMessage.success(`AI生成结果已导入，新增 ${addedCount} 条评论`);
}

async function createCommentsByTexts(texts: string[], source: string) {
  if (!can('daily-task:comment:create')) return 0;
  if (!props.taskId) return 0;
  const existing = new Set(comments.value.map((item) => normalizeText(item.content)).filter(Boolean));
  const pending = uniq(texts)
    .map((text) => normalizeText(text))
    .filter((text) => text && !existing.has(text))
    .map((text) => ({
      content: text,
      source,
      status: 'AVAILABLE'
    }));

  if (!pending.length) return 0;

  await dailyTasksApi.createTaskComment(props.taskId, pending.length === 1 ? pending[0] : pending);

  emit('changed');
  await loadComments();
  return pending.length;
}

function resetEditingState() {
  editingId.value = '';
  editingContent.value = '';
  editingStatus.value = 'AVAILABLE';
  editingSource.value = 'MANUAL';
}

function createDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isDraftId(id: string) {
  return typeof id === 'string' && id.startsWith('draft_');
}

function isCommentEditable(row: TaskCommentRow) {
  return Boolean(row.isDraft || isDraftId(row.id) || row.status === 'AVAILABLE');
}

function isRowSelectable(row: TaskCommentRow) {
  return isCommentEditable(row);
}

function clearSelection() {
  selectedIds.value = [];
  nextTick(() => {
    commentTableRef.value?.clearSelection();
  });
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniq(items: string[]) {
  const cache = new Set<string>();
  const result: string[] = [];
  items.forEach((item) => {
    const text = normalizeText(item);
    if (!text || cache.has(text)) return;
    cache.add(text);
    result.push(text);
  });
  return result;
}
</script>

<style scoped>
:deep(.task-comments-drawer .el-drawer) {
  max-width: 100vw;
}

:deep(.task-comments-drawer .el-drawer__header) {
  margin-bottom: 0;
  padding: 16px 20px 12px;
}

:deep(.task-comments-drawer .el-drawer__body) {
  overflow: hidden;
  padding: 12px 16px 16px;
}

.task-comments-table :deep(.el-table__cell) {
  vertical-align: middle;
}

.task-comments-table :deep(.cell) {
  text-align: center;
}

.task-comments-table :deep(.el-table__body td:first-child .cell),
.task-comments-table :deep(.el-table__header th:first-child .cell) {
  padding-left: 0;
  padding-right: 0;
}

.task-comments-table :deep(.el-button + .el-button) {
  margin-left: 8px;
}

.comment-content-cell {
  width: 100%;
  max-width: min(100%, 560px);
  margin: 0 auto;
}

@media (max-width: 1280px) {
  :deep(.task-comments-drawer .el-drawer__header) {
    padding: 12px 14px 10px;
  }

  :deep(.task-comments-drawer .el-drawer__body) {
    padding: 10px 12px 12px;
  }

  .comment-content-cell {
    max-width: 100%;
  }
}
</style>
