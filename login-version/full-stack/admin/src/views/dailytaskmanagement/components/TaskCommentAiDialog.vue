<template>
  <el-dialog
    v-model="visible"
    title="AI生成评论"
    width="min(1440px, 96vw)"
    top="4vh"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <div class="flex h-[78vh] flex-col">
      <div class="mb-4 flex items-center justify-between gap-3">
        <el-alert
          title="以下配置项均为必填。点击中间 AI生成 先预览结果，确认无误后再导入评论列表。"
          type="info"
          :closable="false"
          show-icon
          class="min-w-0 flex-1"
        />
        <el-button plain @click="fillPresetConfig">默认数据回填</el-button>
      </div>

      <div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div class="grid h-full min-w-[1180px] grid-cols-[minmax(0,1.3fr)_120px_minmax(360px,1.1fr)] gap-4">
          <section class="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div class="mb-2 flex items-center justify-between">
              <div class="text-sm font-medium text-slate-700 dark:text-slate-200">生成效果</div>
              <div class="text-xs text-slate-500">{{ generatedRows.length ? `共 ${generatedRows.length} 条` : '尚未生成' }}</div>
            </div>
            <div v-if="generatedRows.length" class="min-h-0 flex-1">
              <el-table :data="generatedRows" size="small" max-height="100%" stripe height="100%">
                <el-table-column label="#" width="56">
                  <template #default="{ $index }">{{ $index + 1 }}</template>
                </el-table-column>
                <el-table-column label="主评论" min-width="260">
                  <template #default="{ row }">
                    <div class="whitespace-pre-wrap break-words leading-5 text-slate-700 dark:text-slate-200">
                      {{ row.commentText || '--' }}
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="120">
                  <template #default="{ row }">
                    <div class="whitespace-pre-wrap break-words leading-5 text-slate-700 dark:text-slate-200">{{ row.type || '--' }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="回复预览" min-width="260">
                  <template #default="{ row }">
                    <div class="whitespace-pre-wrap break-words leading-5 text-slate-700 dark:text-slate-200">
                      {{ row.replies.join('\n') || '--' }}
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
            <div
              v-else
              class="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500"
            >
              点击中间 AI生成 后，在这里查看生成结果
            </div>
          </section>

          <section class="flex items-center justify-center">
            <el-button type="success" :loading="generating" @click="handleGenerate">AI生成</el-button>
          </section>

          <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" class="min-h-0 min-w-[360px] overflow-y-auto pr-2">
            <el-form-item label="生成指令" prop="messageContent">
              <el-input v-model="form.messageContent" type="textarea" :rows="3" maxlength="500" show-word-limit />
            </el-form-item>
            <el-form-item label="基于上下文">
              <el-radio-group v-model="form.useConversationContext">
                <el-radio :value="false">否</el-radio>
                <el-radio :value="true">是</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="生成条数" prop="count">
              <el-input-number v-model="form.count" :min="1" :max="50" class="!w-full" />
            </el-form-item>
            <el-form-item label="视频标题" prop="videoTitle">
              <el-input v-model="form.videoTitle" maxlength="120" />
            </el-form-item>
            <el-form-item label="视频链接" prop="videoUrl">
              <el-input v-model="form.videoUrl" />
            </el-form-item>
            <el-form-item label="视频内容" prop="videoContent">
              <el-input v-model="form.videoContent" type="textarea" :rows="4" maxlength="1000" show-word-limit />
            </el-form-item>
            <el-form-item label="账号定位" prop="accountPositioning">
              <el-input v-model="form.accountPositioning" type="textarea" :rows="3" maxlength="500" show-word-limit />
            </el-form-item>
            <el-form-item label="视频风格" prop="videoStyle">
              <el-input v-model="form.videoStyle" maxlength="100" />
            </el-form-item>
            <el-form-item label="视频脚本" prop="videoScript">
              <el-input v-model="form.videoScript" type="textarea" :rows="4" maxlength="1000" show-word-limit />
            </el-form-item>
            <el-form-item label="目标受众" prop="targetAudience">
              <el-input v-model="form.targetAudience" type="textarea" :rows="3" maxlength="500" show-word-limit />
            </el-form-item>
            <el-form-item label="受众痛点" prop="audiencePainPoint">
              <el-input v-model="form.audiencePainPoint" type="textarea" :rows="3" maxlength="500" show-word-limit />
            </el-form-item>
            <el-form-item label="运营目标" prop="operationGoal">
              <el-input v-model="form.operationGoal" type="textarea" :rows="3" maxlength="500" show-word-limit />
            </el-form-item>
            <el-form-item label="平台" prop="platform">
              <el-input v-model="form.platform" maxlength="50" />
            </el-form-item>
            <el-form-item label="系统提示词" prop="customSystemPrompt">
              <el-input v-model="form.customSystemPrompt" type="textarea" :rows="4" maxlength="1000" show-word-limit />
            </el-form-item>
            <el-form-item label="用户提示词" prop="customUserPrompt">
              <el-input v-model="form.customUserPrompt" type="textarea" :rows="4" maxlength="1000" show-word-limit />
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!generatedRows.length" @click="handleConfirm">导入评论</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElLoading, ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import * as dailyTasksApi from '@/api/modules/dailyTasks';
import { AI_COMMENT_CONFIG_DEFAULT_FORM, AI_COMMENT_CONFIG_PRESET_FORM } from '../constants';
import type { AiGenerateFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [comments: string[]];
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const formRef = ref<FormInstance>();
const form = reactive<AiGenerateFormModel>(createEmptyConfig());
const generating = ref(false);
const generatedRows = ref<dailyTasksApi.AiGeneratedCommentItem[]>([]);

const rules: FormRules<AiGenerateFormModel> = {
  messageContent: [{ required: true, message: '请输入生成指令', trigger: 'blur' }],
  count: [{ required: true, type: 'number', min: 1, message: '请输入生成条数', trigger: 'change' }],
  videoTitle: [{ required: true, message: '请输入视频标题', trigger: 'blur' }],
  videoUrl: [{ required: true, message: '请输入视频链接', trigger: 'blur' }],
  videoContent: [{ required: true, message: '请输入视频内容', trigger: 'blur' }],
  accountPositioning: [{ required: true, message: '请输入账号定位', trigger: 'blur' }],
  videoStyle: [{ required: true, message: '请输入视频风格', trigger: 'blur' }],
  videoScript: [{ required: true, message: '请输入视频脚本', trigger: 'blur' }],
  targetAudience: [{ required: true, message: '请输入目标受众', trigger: 'blur' }],
  audiencePainPoint: [{ required: true, message: '请输入受众痛点', trigger: 'blur' }],
  operationGoal: [{ required: true, message: '请输入运营目标', trigger: 'blur' }],
  platform: [{ required: true, message: '请输入平台', trigger: 'blur' }],
  customSystemPrompt: [{ required: true, message: '请输入系统提示词', trigger: 'blur' }],
  customUserPrompt: [{ required: true, message: '请输入用户提示词', trigger: 'blur' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, createEmptyConfig(), cloneConfig(AI_COMMENT_CONFIG_DEFAULT_FORM));
    generatedRows.value = [];
    formRef.value?.clearValidate();
  }
);

async function handleGenerate() {
  if (generating.value) return;
  try {
    await formRef.value?.validate();
  } catch {
    ElMessage.warning('请先完成 AI 评论配置');
    return;
  }
  generating.value = true;
  const loading = ElLoading.service({
    lock: true,
    text: 'AI 正在生成评论，请稍候...',
    background: 'rgba(255, 255, 255, 0.75)'
  });
  try {
    const rows = await dailyTasksApi.aiGenerateComments(normalizeAiGeneratePayload(form));
    generatedRows.value = rows;
    ElMessage.success(`AI生成成功，共 ${rows.length} 条`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI生成失败，请稍后重试';
    ElMessage.error(message);
  } finally {
    generating.value = false;
    loading.close();
  }
}

function handleConfirm() {
  const texts = generatedRows.value.map((item) => item.commentText.trim()).filter(Boolean);
  emit('confirm', texts);
  visible.value = false;
}

function fillPresetConfig() {
  Object.assign(form, createEmptyConfig(), cloneConfig(AI_COMMENT_CONFIG_PRESET_FORM));
  formRef.value?.clearValidate();
}

function normalizeAiGeneratePayload(config: AiGenerateFormModel): dailyTasksApi.AiGenerateCommentsPayload {
  return {
    messageContent: normalizeText(config.messageContent),
    useConversationContext: Boolean(config.useConversationContext),
    count: Number(config.count),
    videoTitle: normalizeText(config.videoTitle),
    videoUrl: normalizeText(config.videoUrl),
    videoContent: normalizeText(config.videoContent),
    accountPositioning: normalizeText(config.accountPositioning),
    videoStyle: normalizeText(config.videoStyle),
    videoScript: normalizeText(config.videoScript),
    targetAudience: normalizeText(config.targetAudience),
    audiencePainPoint: normalizeText(config.audiencePainPoint),
    operationGoal: normalizeText(config.operationGoal),
    platform: normalizeText(config.platform),
    customSystemPrompt: normalizeText(config.customSystemPrompt),
    customUserPrompt: normalizeText(config.customUserPrompt)
  };
}

function cloneConfig(value: AiGenerateFormModel): AiGenerateFormModel {
  return {
    messageContent: value.messageContent,
    useConversationContext: Boolean(value.useConversationContext),
    count: value.count,
    videoTitle: value.videoTitle,
    videoUrl: value.videoUrl,
    videoContent: value.videoContent,
    accountPositioning: value.accountPositioning,
    videoStyle: value.videoStyle,
    videoScript: value.videoScript,
    targetAudience: value.targetAudience,
    audiencePainPoint: value.audiencePainPoint,
    operationGoal: value.operationGoal,
    platform: value.platform,
    customSystemPrompt: value.customSystemPrompt,
    customUserPrompt: value.customUserPrompt
  };
}

function createEmptyConfig(): AiGenerateFormModel {
  return {
    ...AI_COMMENT_CONFIG_DEFAULT_FORM
  };
}

function normalizeText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}
</script>
