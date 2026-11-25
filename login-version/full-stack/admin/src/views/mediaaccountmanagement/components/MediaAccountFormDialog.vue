<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增多媒体账号' : '编辑多媒体账号'" width="680px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="115px">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <el-form-item label="所属租户" prop="tenantId">
          <el-select
            v-model="form.tenantId"
            placeholder="请选择租户"
            filterable
            class="w-full"
            :clearable="canSelectTenant"
            :disabled="mode === 'edit' || !canSelectTenant"
          >
            <el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台" prop="platform">
          <el-select v-model="form.platform" placeholder="请选择平台" clearable class="w-full">
            <el-option v-for="item in platformOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号 ID" prop="accountId">
          <el-input v-model="form.accountId" placeholder="请输入平台账号 ID" />
        </el-form-item>
        <el-form-item label="账号名称" prop="accountName">
          <el-input v-model="form.accountName" placeholder="请输入账号名称" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" placeholder="请选择状态" class="w-full">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </div>
      <el-form-item label="账号定位">
        <el-input v-model="form.positioning" type="textarea" :rows="3" placeholder="例如：矩阵种草、直播导流、客户案例" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="可选" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { SelectOption } from '@/utils/apiData';
import { MEDIA_ACCOUNT_DEFAULT_FORM } from '../constants';
import type { MediaAccountFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<MediaAccountFormModel>;
  tenantOptions: SelectOption[];
  platformOptions: SelectOption[];
  statusOptions: SelectOption[];
  canSelectTenant?: boolean;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: MediaAccountFormModel];
}>();

const formRef = ref<FormInstance>();
const form = reactive<MediaAccountFormModel>({ ...MEDIA_ACCOUNT_DEFAULT_FORM });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const rules: FormRules<MediaAccountFormModel> = {
  tenantId: [{ required: true, message: '请选择租户', trigger: 'change' }],
  platform: [{ required: true, message: '请选择平台', trigger: 'change' }],
  accountId: [{ required: true, message: '请输入账号 ID', trigger: 'blur' }],
  accountName: [{ required: true, message: '请输入账号名称', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, MEDIA_ACCOUNT_DEFAULT_FORM, props.initialData ?? {});
  }
);

async function handleSubmit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>
