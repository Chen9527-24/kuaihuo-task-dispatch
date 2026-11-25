<template>
  <el-dialog v-model="visible" title="订单驳回" width="560px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <div class="mb-4 grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 dark:bg-slate-800">
        <div>
          <div class="text-xs text-slate-500">用户姓名</div>
          <div class="mt-1 font-medium">{{ order?.visitorName || '--' }}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">手机号</div>
          <div class="mt-1 font-medium">{{ order?.phone || '--' }}</div>
        </div>
      </div>

      <el-form-item label="驳回原因" prop="rejectReason">
        <el-input
          v-model="form.rejectReason"
          type="textarea"
          :rows="4"
          maxlength="200"
          show-word-limit
          placeholder="请输入驳回原因"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="handleSubmit">确认驳回</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import * as dailyTasksApi from '@/api/modules/dailyTasks';

interface RejectFormModel {
  rejectReason: string;
}

const props = defineProps<{
  modelValue: boolean;
  taskId?: string;
  order?: dailyTasksApi.DailyTaskOrderItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  rejected: [];
}>();

const formRef = ref<FormInstance>();
const submitting = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const form = reactive<RejectFormModel>({
  rejectReason: ''
});

const rules: FormRules<RejectFormModel> = {
  rejectReason: [{ required: true, message: '请输入驳回原因', trigger: 'blur' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    form.rejectReason = '';
    formRef.value?.clearValidate();
  },
  { immediate: true }
);

async function handleSubmit() {
  if (!props.taskId || !props.order?.participantId) return;
  await formRef.value?.validate();

  submitting.value = true;
  try {
    await dailyTasksApi.rejectDailyTaskOrder(props.taskId, props.order.participantId, {
      rejectReason: form.rejectReason.trim()
    });
    ElMessage.success('订单已驳回');
    visible.value = false;
    emit('rejected');
  } finally {
    submitting.value = false;
  }
}
</script>
