<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增每日任务' : '编辑每日任务'" width="1160px" destroy-on-close class="daily-task-form-dialog">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
      <section class="form-section">
        <div class="form-section-title">
          <div><span>01</span><h3>任务归属与投放范围</h3></div>
          <p>所属租户负责数据隔离；投放范围决定哪些成员可以领取。</p>
        </div>
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="所属租户" prop="tenantId">
            <el-select v-model="form.tenantId" placeholder="请选择租户" filterable clearable class="w-full" :disabled="mode === 'edit'">
              <el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="平台" prop="platform">
            <el-select v-model="form.platform" placeholder="请选择平台" clearable class="w-full">
              <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="多媒体账号" prop="mediaAccountId">
            <el-select v-model="form.mediaAccountId" placeholder="请选择账号" filterable clearable class="w-full" :loading="accountLoading">
              <el-option v-for="item in mediaAccountOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="任务投放范围" prop="distributionScope">
            <el-radio-group v-model="form.distributionScope" :disabled="commissionLocked">
              <el-radio-button label="TENANT">全租户开放</el-radio-button>
              <el-radio-button label="GROUP">指定团队</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.distributionScope === 'GROUP'" label="指定团队" prop="distributionGroupId" class="md:col-span-2">
            <el-select v-model="form.distributionGroupId" placeholder="请选择团队" filterable clearable class="w-full" :loading="groupLoading" :disabled="commissionLocked">
              <el-option v-for="item in groupOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <div class="field-hint">只有该团队当前有效成员可领取；团长佣金的接收方固定为该团队当前团长快照。</div>
          </el-form-item>
          <div v-else class="scope-note md:col-span-2">全租户开放：当前租户内所有符合条件的成员都可看到并领取；该类任务不支持团长分佣。</div>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-title">
          <div><span>02</span><h3>任务金额与团队佣金</h3></div>
          <p>佣金只由本任务配置，发布后保存为快照；团长档案不再设置默认规则。</p>
        </div>
        <el-alert v-if="commissionLocked" type="warning" :closable="false" title="已有用户领取：任务范围、任务金额、团队与佣金快照已锁定。如需调整，请暂停或关闭当前任务后重新创建。" class="mb-4" />
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="任务金额（分）" prop="taskBudgetAmount">
            <el-input-number v-model="form.taskBudgetAmount" :min="1" :max="99999999" :precision="0" :step="100" class="!w-full" :disabled="commissionLocked" />
            <div class="field-hint">录入 {{ formatMoney(form.taskBudgetAmount) }}。金额内包含佣金时，这是平台总预算；金额外另计时，这是成员基础收益。</div>
          </el-form-item>
          <el-form-item label="启用团队佣金">
            <el-switch v-model="form.commissionEnabled" :disabled="form.distributionScope !== 'GROUP' || commissionLocked" active-text="启用" inactive-text="不启用" />
            <div v-if="form.distributionScope !== 'GROUP'" class="field-hint">选择“指定团队”后才能设置团队佣金。</div>
          </el-form-item>
        </div>
        <template v-if="form.distributionScope === 'GROUP' && form.commissionEnabled">
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <el-form-item label="分佣方式" prop="commissionRuleType">
              <el-select v-model="form.commissionRuleType" :disabled="commissionLocked" class="w-full">
                <el-option label="按任务金额比例" value="PERCENT" />
                <el-option label="每单固定金额" value="FIXED" />
              </el-select>
            </el-form-item>
            <el-form-item :label="form.commissionRuleType === 'PERCENT' ? '比例（%）' : '金额（元）'" prop="commissionRuleDisplayValue">
              <el-input-number
                v-model="form.commissionRuleDisplayValue"
                :min="0.01"
                :max="form.commissionRuleType === 'PERCENT' ? 100 : 999999"
                :precision="2"
                :step="form.commissionRuleType === 'PERCENT' ? 0.5 : 0.1"
                :disabled="commissionLocked"
                class="!w-full"
              />
            </el-form-item>
            <el-form-item label="佣金承担方式" class="md:col-span-2">
              <el-radio-group v-model="form.commissionMode" :disabled="commissionLocked">
                <el-radio label="EXTRA">任务金额外另计</el-radio>
                <el-radio label="INCLUDED">任务金额内包含</el-radio>
              </el-radio-group>
              <div class="field-hint">{{ form.commissionMode === 'INCLUDED' ? '成员端金额 = 任务金额 − 团长佣金；平台总成本不变。' : '成员端金额 = 任务金额；团长佣金由平台额外承担。' }}</div>
            </el-form-item>
          </div>
          <div class="commission-preview">
            <div><span>成员端可得金额</span><strong>{{ formatMoney(commissionPreview.workerAmount) }}</strong></div>
            <div><span>本单团长佣金</span><strong class="text-emerald-600">{{ formatMoney(commissionPreview.commissionAmount) }}</strong></div>
            <div><span>平台总成本</span><strong>{{ formatMoney(commissionPreview.totalCost) }}</strong></div>
            <p>{{ form.commissionMode === 'INCLUDED' ? '金额内包含：成员和团长合计等于任务金额。' : '金额外另计：团长佣金在成员任务金额之外另行入账。' }}</p>
          </div>
        </template>
      </section>

      <section class="form-section">
        <div class="form-section-title">
          <div><span>03</span><h3>任务内容</h3></div>
          <p>成员领取后看到的标题、视频入口、封面和评论要求。</p>
        </div>
        <el-alert v-if="mode === 'create'" type="info" :closable="false" title="新任务会先保存为草稿。发布、暂停、恢复、关闭、归档均通过列表中的独立操作执行，不能在编辑表单直接改状态。" class="mb-4" />
        <el-alert v-else type="info" :closable="false" :title="`当前状态：${props.initialData?.status || '--'}。状态通过列表操作流转，编辑只修改任务内容。`" class="mb-4" />
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-[1fr_180px]">
          <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <el-form-item label="目标评论数" prop="targetCommentCount">
              <el-input-number v-model="form.targetCommentCount" :min="0" :max="9999" class="!w-full" />
            </el-form-item>
            <el-form-item label="成员实际收益">
              <el-input :model-value="formatMoney(commissionPreview.workerAmount)" disabled />
            </el-form-item>
            <el-form-item label="任务标题" prop="title" class="md:col-span-2"><el-input v-model="form.title" placeholder="请输入任务标题" /></el-form-item>
            <el-form-item label="主视频链接" prop="videoUrl" class="md:col-span-2"><el-input v-model="form.videoUrl" placeholder="请输入视频链接" /></el-form-item>
            <el-form-item label="备选链接" class="md:col-span-2">
              <div class="w-full space-y-2">
                <div v-for="(_url, index) in form.backupVideoUrls" :key="`backup-${index}`" class="flex items-center gap-2">
                  <el-input v-model="form.backupVideoUrls[index]" placeholder="请输入备选视频链接" />
                  <el-button link type="danger" @click="removeBackupVideoUrl(index)">删除</el-button>
                </div>
                <el-button plain @click="appendBackupVideoUrl">新增备选链接</el-button>
              </div>
            </el-form-item>
          </div>
          <el-form-item label="封面"><FileUploadField v-model="form.coverFileId" v-model:url="form.coverUrl" scene="TASK_COVER" placeholder="封面" accept="image/*" :max-size-mb="5" /></el-form-item>
        </div>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="评论内容"><el-button plain @click="commentDialogVisible = true">评论集（{{ commentTexts.length }} 条）</el-button></el-form-item>
      </section>
    </el-form>

    <CommentCollectionDialog v-model="commentDialogVisible" :mode="mode" :comments="commentTexts" :ai-config="aiConfig" @save="handleCommentSave" @update:ai-config="handleAiConfigSave" />

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">保存任务</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import type { SelectOption } from '@/utils/apiData';
import FileUploadField from '@/components/common/FileUploadField.vue';
import CommentCollectionDialog from './CommentCollectionDialog.vue';
import { AI_COMMENT_CONFIG_DEFAULT_FORM, DAILY_TASK_DEFAULT_FORM } from '../constants';
import type { AiGenerateFormModel, DailyTaskFormModel } from '../types';

export interface LeaderGroupOption extends SelectOption {
  leaderName?: string | null;
  memberCount?: number;
}

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<DailyTaskFormModel> & { commissionLocked?: boolean; participantCount?: number };
  taskId?: string;
  tenantOptions: SelectOption[];
  platformOptions: SelectOption[];
  statusOptions: SelectOption[];
  mediaAccountOptions: SelectOption[];
  groupOptions: LeaderGroupOption[];
  accountLoading?: boolean;
  groupLoading?: boolean;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: DailyTaskFormModel];
  dependencyChange: [payload: { tenantId: string; platform: string; needsGroupOptions: boolean }];
}>();

const formRef = ref<FormInstance>();
const initializing = ref(false);
const form = reactive<DailyTaskFormModel>({ ...DAILY_TASK_DEFAULT_FORM });
const commentDialogVisible = ref(false);
const commentTexts = ref<string[]>([]);
const aiConfig = ref<AiGenerateFormModel>(createAiConfigDefaults());
const commissionLocked = computed(() => Boolean(props.initialData?.commissionLocked));
const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });

const commissionRuleRawValue = computed(() => {
  const display = Math.max(0, Number(form.commissionRuleDisplayValue || 0));
  return Math.round(display * 100);
});

const commissionPreview = computed(() => {
  const budget = Math.max(0, Number(form.taskBudgetAmount || 0));
  if (form.distributionScope !== 'GROUP' || !form.commissionEnabled) return { commissionAmount: 0, workerAmount: budget, totalCost: budget };
  const raw = commissionRuleRawValue.value;
  const amount = form.commissionRuleType === 'PERCENT' ? Math.floor((budget * raw) / 10_000) : raw;
  const commissionAmount = Math.max(0, amount);
  const workerAmount = form.commissionMode === 'INCLUDED' ? Math.max(0, budget - commissionAmount) : budget;
  const totalCost = form.commissionMode === 'INCLUDED' ? budget : budget + commissionAmount;
  return { commissionAmount, workerAmount, totalCost };
});

const rules: FormRules<DailyTaskFormModel> = {
  tenantId: [{ required: true, message: '请选择租户', trigger: 'change' }],
  mediaAccountId: [{ required: true, message: '请选择多媒体账号', trigger: 'change' }],
  platform: [{ required: true, message: '请选择平台', trigger: 'change' }],
  title: [{ required: true, message: '请输入任务标题', trigger: 'blur' }],
  videoUrl: [{ required: true, message: '请输入视频链接', trigger: 'blur' }],
  targetCommentCount: [{ required: true, message: '请输入目标评论数', trigger: 'blur' }],
  taskBudgetAmount: [{ required: true, type: 'number', min: 1, message: '请输入大于 0 的任务金额', trigger: 'change' }],
  distributionScope: [{ required: true, message: '请选择任务投放范围', trigger: 'change' }],
  distributionGroupId: [{
    validator: (_rule, value, callback) => {
      if (form.distributionScope === 'GROUP' && !String(value || '').trim()) callback(new Error('请选择指定团队'));
      else callback();
    },
    trigger: 'change',
  }],
  commissionRuleType: [{
    validator: (_rule, value, callback) => {
      if (form.distributionScope === 'GROUP' && form.commissionEnabled && !['PERCENT', 'FIXED'].includes(String(value || ''))) callback(new Error('请选择分佣方式'));
      else callback();
    },
    trigger: 'change',
  }],
  commissionRuleDisplayValue: [{
    validator: (_rule, value, callback) => {
      if (form.distributionScope === 'GROUP' && form.commissionEnabled && Number(value || 0) <= 0) callback(new Error('请输入大于 0 的分佣值'));
      else callback();
    },
    trigger: 'change',
  }],
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    initializing.value = true;
    const initial = props.initialData as (Partial<DailyTaskFormModel> & { comment?: unknown; comments?: unknown }) | undefined;
    Object.assign(form, normalizeInitialForm(initial));
    commentTexts.value = resolveInitialCommentItems(initial);
    syncTargetCommentCount();
    aiConfig.value = buildAiConfigFromForm();
    emitDependencyChange();
    queueMicrotask(() => { initializing.value = false; });
  },
);

watch(
  () => [form.tenantId, form.platform],
  () => {
    if (!initializing.value) {
      form.mediaAccountId = '';
    }
    emitDependencyChange();
  },
);

watch(
  () => form.distributionScope,
  (scope) => {
    if (scope !== 'GROUP') {
      form.distributionGroupId = '';
      form.commissionEnabled = false;
      form.commissionRuleType = 'PERCENT';
      form.commissionRuleDisplayValue = 1;
      form.commissionMode = 'EXTRA';
    }
    emitDependencyChange();
  },
);

watch(
  () => form.commissionEnabled,
  (enabled) => {
    // A new group-commission task starts at 1.00% (100 basis points).
    // Do not let a stale zero value reach the API when the switch is enabled.
    if (enabled && Number(form.commissionRuleDisplayValue || 0) <= 0) {
      form.commissionRuleType = 'PERCENT';
      form.commissionRuleDisplayValue = 1;
      form.commissionMode = 'EXTRA';
    }
  },
);

watch(
  () => [form.title, form.videoUrl, form.copywriting, form.platform, form.targetCommentCount],
  () => syncAiConfigFromForm(),
);

function emitDependencyChange() {
  emit('dependencyChange', {
    tenantId: form.tenantId,
    platform: form.platform,
    needsGroupOptions: form.distributionScope === 'GROUP',
  });
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (form.distributionScope === 'GROUP' && form.commissionEnabled) {
    if (commissionPreview.value.commissionAmount <= 0) {
      ElMessage.warning('当前任务规则计算出的佣金为 0，请调整任务金额或分佣值');
      return;
    }
    if (form.commissionMode === 'INCLUDED' && commissionPreview.value.workerAmount <= 0) {
      ElMessage.warning('金额内包含佣金时，成员实际收益必须大于 0');
      return;
    }
  }
  form.commentItems = commentTexts.value.map((text) => ({ text: text.trim() })).filter((item) => item.text);
  form.rewardAmount = commissionPreview.value.workerAmount;
  const isGroupCommission = form.distributionScope === 'GROUP' && form.commissionEnabled;
  const commissionRuleValue = isGroupCommission ? commissionRuleRawValue.value : 0;
  form.commissionRuleValue = commissionRuleValue;

  // Emit a canonical commission snapshot. The parent serializes this exact value
  // into the POST body, rather than relying on a stale reactive field.
  const payload = normalizeInitialForm(form);
  payload.commissionEnabled = isGroupCommission;
  payload.commissionRuleType = form.commissionRuleType === 'FIXED' ? 'FIXED' : 'PERCENT';
  payload.commissionRuleValue = commissionRuleValue;
  payload.commissionRuleDisplayValue = isGroupCommission ? Number(form.commissionRuleDisplayValue) : 0;
  payload.commissionMode = form.commissionMode === 'INCLUDED' ? 'INCLUDED' : 'EXTRA';
  emit('submit', payload);
}

function handleCommentSave(texts: string[]) { commentTexts.value = texts; syncTargetCommentCount(); }
function handleAiConfigSave(config: AiGenerateFormModel) { aiConfig.value = { ...config }; }
function appendBackupVideoUrl() { form.backupVideoUrls.push(''); }
function removeBackupVideoUrl(index: number) { form.backupVideoUrls.splice(index, 1); }

function normalizeInitialForm(initial?: Partial<DailyTaskFormModel>): DailyTaskFormModel {
  const rewardAmount = normalizeNumber(initial?.rewardAmount, DAILY_TASK_DEFAULT_FORM.rewardAmount);
  const taskBudgetAmount = normalizeNumber(initial?.taskBudgetAmount, rewardAmount || DAILY_TASK_DEFAULT_FORM.taskBudgetAmount);
  const ruleType = normalizeString(initial?.commissionRuleType).toUpperCase() === 'FIXED' ? 'FIXED' : 'PERCENT';
  const rawRuleValue = normalizeNumber(initial?.commissionRuleValue, 100);
  return {
    ...DAILY_TASK_DEFAULT_FORM,
    tenantId: normalizeString(initial?.tenantId),
    mediaAccountId: normalizeString(initial?.mediaAccountId),
    platform: normalizeString(initial?.platform),
    title: normalizeString(initial?.title),
    videoUrl: normalizeString(initial?.videoUrl),
    backupVideoUrls: normalizeStringArray(initial?.backupVideoUrls),
    coverFileId: normalizeString(initial?.coverFileId),
    coverUrl: normalizeString(initial?.coverUrl),
    copywriting: normalizeString(initial?.copywriting),
    commentRequirement: normalizeString(initial?.commentRequirement),
    commentExample: normalizeString(initial?.commentExample),
    targetCommentCount: normalizeNumber(initial?.targetCommentCount, DAILY_TASK_DEFAULT_FORM.targetCommentCount),
    rewardAmount,
    taskBudgetAmount,
    status: normalizeString(initial?.status) || DAILY_TASK_DEFAULT_FORM.status,
    distributionScope: normalizeString(initial?.distributionScope) === 'GROUP' ? 'GROUP' : 'TENANT',
    distributionGroupId: normalizeString(initial?.distributionGroupId),
    allowGroupCollaboration: false,
    commissionEnabled: Boolean(initial?.commissionEnabled),
    commissionRuleId: '',
    commissionRuleType: ruleType,
    commissionRuleValue: rawRuleValue,
    commissionRuleDisplayValue: rawRuleValue > 0 ? rawRuleValue / 100 : 1,
    commissionMode: normalizeString(initial?.commissionMode) === 'INCLUDED' ? 'INCLUDED' : 'EXTRA',
    remark: normalizeString(initial?.remark),
    commentItems: Array.isArray(initial?.commentItems) ? initial!.commentItems.map((item) => ({ text: resolveCommentText(item) })).filter((item) => item.text) : [],
  };
}

function resolveInitialCommentItems(initial: { comment?: unknown; comments?: unknown; commentItems?: unknown } | undefined) {
  const rawComment = initial?.comment;
  if (Array.isArray(rawComment)) return rawComment.map((item) => resolveCommentText(item)).filter(Boolean);
  const rawComments = initial?.comments;
  if (Array.isArray(rawComments)) return rawComments.map((item) => resolveCommentText(item)).filter(Boolean);
  const formItems = initial?.commentItems;
  if (Array.isArray(formItems)) return formItems.map((item) => resolveCommentText(item)).filter(Boolean);
  return [];
}
function resolveCommentText(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return '';
  if ('text' in item && typeof item.text === 'string') return item.text.trim();
  if ('content' in item && typeof item.content === 'string') return item.content.trim();
  return '';
}
function syncTargetCommentCount() { form.targetCommentCount = commentTexts.value.length; }
function normalizeString(value: unknown) { return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''; }
function normalizeStringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []; }
function normalizeNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) { const parsed = Number(value); if (Number.isFinite(parsed)) return parsed; }
  return fallback;
}
function formatMoney(value: unknown) { return `¥${(Number(value || 0) / 100).toFixed(2)}`; }
function syncAiConfigFromForm() { aiConfig.value = buildAiConfigFromForm(aiConfig.value); }
function buildAiConfigFromForm(current?: AiGenerateFormModel): AiGenerateFormModel {
  const config = { ...createAiConfigDefaults(), ...(current ?? {}) };
  if (!config.videoTitle) config.videoTitle = form.title || '';
  if (!config.videoUrl) config.videoUrl = form.videoUrl || '';
  if (!config.videoContent) config.videoContent = form.copywriting || '';
  if (!config.videoScript) config.videoScript = form.copywriting || '';
  if (!config.platform) config.platform = resolvePlatformLabel(form.platform);
  if (!config.count || config.count < 1) config.count = form.targetCommentCount || AI_COMMENT_CONFIG_DEFAULT_FORM.count;
  return config;
}
function createAiConfigDefaults(): AiGenerateFormModel { return { ...AI_COMMENT_CONFIG_DEFAULT_FORM }; }
function resolvePlatformLabel(value: string) { return props.platformOptions.find((item) => item.value === value)?.label || value || ''; }
</script>

<style scoped>
.form-section { margin-bottom: 16px; padding: 16px 18px 6px; border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: var(--el-fill-color-extra-light); }
.form-section-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.form-section-title > div { display: flex; align-items: center; gap: 8px; }
.form-section-title span { display: grid; width: 28px; height: 22px; place-items: center; border-radius: 6px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-size: 12px; font-weight: 700; }
.form-section-title h3 { margin: 0; color: var(--el-text-color-primary); font-size: 15px; font-weight: 650; }
.form-section-title p { margin: 2px 0 0; color: var(--el-text-color-secondary); font-size: 12px; text-align: right; }
.field-hint { margin-top: 6px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
.scope-note { margin: 0 0 18px 112px; padding: 10px 12px; border-radius: 8px; color: var(--el-color-info); background: var(--el-color-info-light-9); font-size: 12px; line-height: 1.6; }
.commission-preview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 2px 0 12px; padding: 14px; border: 1px solid var(--el-color-success-light-7); border-radius: 10px; background: var(--el-color-success-light-9); }
.commission-preview div { display: flex; flex-direction: column; gap: 6px; }
.commission-preview span { color: var(--el-text-color-secondary); font-size: 12px; }
.commission-preview strong { color: var(--el-text-color-primary); font-size: 18px; }
.commission-preview p { grid-column: 1 / -1; margin: 0; color: var(--el-text-color-secondary); font-size: 12px; }
@media (max-width: 768px) { .form-section-title { flex-direction: column; } .form-section-title p { text-align: left; } .scope-note { margin-left: 0; } .commission-preview { grid-template-columns: 1fr; } }
</style>
