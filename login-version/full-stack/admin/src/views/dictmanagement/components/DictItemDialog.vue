<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增字典项' : '编辑字典项'" width="620px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="95px">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <el-form-item label="类型" prop="typeCode">
          <el-select v-model="form.typeCode" placeholder="请选择类型" filterable class="w-full" :disabled="mode === 'edit'">
            <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" class="w-full">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="显示文本" prop="label">
          <el-input v-model="form.label" placeholder="例如 抖音" />
        </el-form-item>
        <el-form-item label="选项值" prop="value">
          <el-input v-model="form.value" placeholder="例如 DOUYIN" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-select v-model="form.color" placeholder="可选" clearable class="w-full">
            <el-option v-for="item in colorOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" class="!w-full" />
        </el-form-item>
      </div>
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
import { COLOR_OPTIONS, DICT_ITEM_DEFAULT_FORM } from '../constants';
import type { DictItemFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<DictItemFormModel>;
  typeOptions: SelectOption[];
  statusOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [payload: DictItemFormModel] }>();

const formRef = ref<FormInstance>();
const form = reactive<DictItemFormModel>({ ...DICT_ITEM_DEFAULT_FORM });
const colorOptions = COLOR_OPTIONS;

const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });

const rules: FormRules<DictItemFormModel> = {
  typeCode: [{ required: true, message: '请选择字典类型', trigger: 'change' }],
  label: [{ required: true, message: '请输入显示文本', trigger: 'blur' }],
  value: [{ required: true, message: '请输入选项值', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) Object.assign(form, DICT_ITEM_DEFAULT_FORM, props.initialData ?? {});
  }
);

async function submit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>
