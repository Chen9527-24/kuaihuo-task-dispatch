<template>
  <el-dialog v-model="visible" title="订单结算" width="680px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="space-y-4">
      <div class="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 dark:bg-slate-800">
        <div>
          <div class="text-xs text-slate-500">用户姓名</div>
          <div class="mt-1 font-medium">{{ order?.visitorName || '--' }}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">手机号</div>
          <div class="mt-1 font-medium">{{ order?.phone || '--' }}</div>
        </div>
      </div>

      <el-form-item label="个人凭证">
        <TaskOrderMediaGallery
          :task-id="taskId"
          :participant-id="order?.participantId"
          :files="order?.proofImages"
          :legacy-urls="order?.legacyProofUrls"
          :max-visible="0"
          size="large"
          empty-text="暂无个人凭证"
          @preview="openMediaPreview"
        />
      </el-form-item>

      <el-form-item label="结算金额" prop="settlementAmountYuan">
        <el-input-number
          v-model="form.settlementAmountYuan"
          :min="0.01"
          :precision="2"
          :step="0.01"
          class="!w-full"
          placeholder="请输入结算金额（元）"
        />
      </el-form-item>

      <el-form-item label="付款订单号" prop="settlementOrderNo">
        <el-input
          v-model="form.settlementOrderNo"
          maxlength="64"
          placeholder="选填，请输入付款订单号"
        />
        <div class="mt-1 text-xs leading-5 text-slate-500">付款订单号用于查询有争议的订单，建议填写</div>
      </el-form-item>

      <el-form-item label="结算备注">
        <el-input
          v-model="form.settlementRemark"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="选填，记录本次结算说明"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确认结算</el-button>
      </div>
    </template>
  </el-dialog>
  <TaskOrderMediaPreviewDialog
    v-model="mediaPreviewVisible"
    :task-id="taskId"
    :participant-id="order?.participantId"
    :sources="mediaPreviewSources"
    :initial-index="mediaPreviewIndex"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import * as dailyTasksApi from '@/api/modules/dailyTasks';
import TaskOrderMediaGallery from './TaskOrderMediaGallery.vue';
import TaskOrderMediaPreviewDialog from './TaskOrderMediaPreviewDialog.vue';
import type { TaskOrderPreviewSource } from './taskOrderMedia.types';

interface SettleFormModel {
  settlementAmountYuan: number;
  settlementOrderNo: string;
  settlementRemark: string;
}

const props = defineProps<{
  modelValue: boolean;
  taskId?: string;
  order?: dailyTasksApi.DailyTaskOrderItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  settled: [];
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const form = reactive<SettleFormModel>({
  settlementAmountYuan: 0.01,
  settlementOrderNo: '',
  settlementRemark: ''
});

const rules: FormRules<SettleFormModel> = {
  settlementAmountYuan: [{ required: true, type: 'number', min: 0.01, message: '请输入结算金额', trigger: 'change' }]
};

const mediaPreviewVisible = ref(false);
const mediaPreviewSources = ref<TaskOrderPreviewSource[]>([]);
const mediaPreviewIndex = ref(0);

watch(
  () => [props.modelValue, props.order] as const,
  ([open]) => {
    if (!open) return;
    form.settlementAmountYuan = centsToYuan(props.order?.settlementAmount || props.order?.taskRewardAmount);
    form.settlementOrderNo = props.order?.settlementOrderNo || '';
    form.settlementRemark = props.order?.settlementRemark || '';
    formRef.value?.clearValidate();
  },
  { immediate: true }
);

function openMediaPreview(payload: { sources: TaskOrderPreviewSource[]; initialIndex: number }) {
  if (!payload.sources.length) return;
  mediaPreviewSources.value = payload.sources;
  mediaPreviewIndex.value = payload.initialIndex;
  mediaPreviewVisible.value = true;
}

function centsToYuan(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0.01;
  return Number((value / 100).toFixed(2));
}

async function handleSubmit() {
  if (!props.taskId || !props.order?.participantId) return;
  await formRef.value?.validate();

  submitting.value = true;
  try {
    await dailyTasksApi.settleDailyTaskOrder(props.taskId, props.order.participantId, {
      settlementAmount: Math.round(form.settlementAmountYuan * 100),
      settlementOrderNo: form.settlementOrderNo.trim() || undefined,
      settlementRemark: form.settlementRemark.trim() || undefined
    });
    ElMessage.success('订单已结算');
    visible.value = false;
    emit('settled');
  } finally {
    submitting.value = false;
  }
}
</script>
