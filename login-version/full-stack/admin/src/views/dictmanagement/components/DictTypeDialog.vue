<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增字典类型' : '编辑字典类型'" width="560px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="95px">
      <el-form-item label="类型编码" prop="code">
        <el-input v-model="form.code" placeholder="例如 media_platform" :disabled="mode === 'edit'" />
      </el-form-item>
      <el-form-item label="类型名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入类型名称" />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-select v-model="form.status" class="w-full">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { SelectOption } from '@/utils/apiData';
import { DICT_TYPE_DEFAULT_FORM } from '../constants';
import type { DictTypeFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<DictTypeFormModel>;
  statusOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [payload: DictTypeFormModel] }>();

const formRef = ref<FormInstance>();
const form = reactive<DictTypeFormModel>({ ...DICT_TYPE_DEFAULT_FORM });

const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });

const rules: FormRules<DictTypeFormModel> = {
  code: [{ required: true, message: '请输入类型编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入类型名称', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) Object.assign(form, DICT_TYPE_DEFAULT_FORM, props.initialData ?? {});
  }
);

async function submit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>
