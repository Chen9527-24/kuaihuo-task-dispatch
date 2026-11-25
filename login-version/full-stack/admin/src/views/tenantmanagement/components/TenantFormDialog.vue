<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增租户' : '编辑租户'" width="720px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <el-form-item label="租户名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入租户名称" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" placeholder="请选择状态" class="w-full">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="行业" prop="industry">
          <el-input v-model="form.industry" placeholder="例如：科技服务" />
        </el-form-item>
        <el-form-item label="有效期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            class="!w-full"
          />
        </el-form-item>
      </div>
      <el-form-item label="产品介绍" prop="productIntro">
        <el-input v-model="form.productIntro" type="textarea" :rows="3" placeholder="请输入产品介绍" />
      </el-form-item>
      <el-form-item label="核心卖点" prop="coreSellingPoint">
        <el-input v-model="form.coreSellingPoint" type="textarea" :rows="3" placeholder="请输入核心卖点" />
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
import { TENANT_DEFAULT_FORM } from '../constants';
import type { TenantFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<TenantFormModel>;
  statusOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: TenantFormModel];
}>();

const formRef = ref<FormInstance>();
const form = reactive<TenantFormModel>({ ...TENANT_DEFAULT_FORM });
const dateRange = ref<string[]>([]);

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const rules: FormRules<TenantFormModel> = {
  name: [{ required: true, message: '请输入租户名称', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  industry: [{ required: true, message: '请输入行业', trigger: 'blur' }],
  productIntro: [{ required: true, message: '请输入产品介绍', trigger: 'blur' }],
  coreSellingPoint: [{ required: true, message: '请输入核心卖点', trigger: 'blur' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, TENANT_DEFAULT_FORM, props.initialData ?? {});
    dateRange.value = [form.startedAt?.slice(0, 10), form.expiredAt?.slice(0, 10)].filter(Boolean);
  }
);

watch(dateRange, (range) => {
  form.startedAt = range?.[0] ?? '';
  form.expiredAt = range?.[1] ?? '';
});

async function handleSubmit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>
