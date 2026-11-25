<template>
  <el-dialog v-model="visible" title="禁止人员接单" width="680px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" class="space-y-4">
      <div class="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 dark:bg-slate-800">
        <div>
          <div class="text-xs text-slate-500">用户姓名</div>
          <div class="mt-1 font-medium">{{ order?.visitorName || order?.appUser?.nickname || '--' }}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">手机号</div>
          <div class="mt-1 font-medium">{{ order?.phone || order?.appUser?.phone || '--' }}</div>
        </div>
      </div>

      <el-form-item label="限制天数" prop="days">
        <el-input-number v-model="form.days" :min="1" :max="365" :precision="0" class="!w-full" />
      </el-form-item>

      <el-form-item label="禁止原因" prop="reason">
        <el-input
          v-model="form.reason"
          type="textarea"
          :rows="4"
          maxlength="255"
          show-word-limit
          placeholder="例如：因为你在完成任务 7 天内就删除了评论，现限制 7 天内不可接单。"
        />
      </el-form-item>

      <el-form-item label="证据截图">
        <FileUploadField
          v-model="form.screenshotFileId"
          scene="APP_USER_RESTRICTION"
          placeholder="上传证据截图（选填）"
          accept="image/*"
          :max-size-mb="5"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="handleSubmit">保存限制</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import FileUploadField from '@/components/common/FileUploadField.vue';
import * as dailyTasksApi from '@/api/modules/dailyTasks';

interface BanFormModel {
  days: number;
  reason: string;
  screenshotFileId: string;
}

const props = defineProps<{
  modelValue: boolean;
  taskId?: string;
  order?: dailyTasksApi.DailyTaskOrderItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  banned: [];
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const form = reactive<BanFormModel>({
  days: 7,
  reason: '因为你在完成任务 7 天内就删除了评论，现限制 7 天内不可接单。',
  screenshotFileId: ''
});

const rules: FormRules<BanFormModel> = {
  days: [{ required: true, type: 'number', min: 1, message: '请填写限制天数', trigger: 'change' }],
  reason: [{ required: true, message: '请填写禁止原因', trigger: 'blur' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    form.days = 7;
    form.reason = '因为你在完成任务 7 天内就删除了评论，现限制 7 天内不可接单。';
    form.screenshotFileId = '';
    formRef.value?.clearValidate();
  }
);

async function handleSubmit() {
  if (!props.taskId || !props.order?.participantId) return;
  await formRef.value?.validate();
  submitting.value = true;
  try {
    await dailyTasksApi.banDailyTaskOrderUser(props.taskId, props.order.participantId, {
      days: form.days,
      reason: form.reason.trim(),
      screenshotFileId: form.screenshotFileId || undefined
    });
    ElMessage.success('已限制该用户接单');
    visible.value = false;
    emit('banned');
  } finally {
    submitting.value = false;
  }
}
</script>
