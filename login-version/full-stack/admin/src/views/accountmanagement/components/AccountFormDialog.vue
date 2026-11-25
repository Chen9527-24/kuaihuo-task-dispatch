<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增账号' : '编辑账号'" width="760px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-[1fr_140px]">
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
          <el-form-item label="所属租户">
            <el-select
              v-model="form.tenantIds"
              placeholder="平台管理员可为空"
              filterable
              clearable
              multiple
              collapse-tags
              collapse-tags-tooltip
              class="w-full"
            >
              <el-option v-for="item in tenantOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="账号" prop="username">
            <el-input v-model="form.username" placeholder="登录账号" :disabled="mode === 'edit'" />
          </el-form-item>
          <el-form-item label="姓名" prop="displayName">
            <el-input v-model="form.displayName" placeholder="请输入姓名" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="form.phone" placeholder="请输入手机号" />
          </el-form-item>
          <el-form-item v-if="mode === 'create'" label="初始密码" prop="password">
            <el-input v-model="form.password" placeholder="请输入初始密码" show-password />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="form.status" placeholder="请选择状态" class="w-full">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="角色" prop="roleIds" class="md:col-span-2">
            <el-select v-model="form.roleIds" placeholder="请选择角色" filterable multiple class="w-full">
              <el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="头像">
          <FileUploadField
            v-model="form.avatarFileId"
            v-model:url="form.avatarUrl"
            scene="USER_AVATAR"
            placeholder="头像"
            accept="image/*"
            :max-size-mb="3"
          />
        </el-form-item>
      </div>
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
import FileUploadField from '@/components/common/FileUploadField.vue';
import { ACCOUNT_DEFAULT_FORM } from '../constants';
import type { AccountFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<AccountFormModel>;
  tenantOptions: SelectOption[];
  roleOptions: SelectOption[];
  statusOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: AccountFormModel];
}>();

const formRef = ref<FormInstance>();
const form = reactive<AccountFormModel>({ ...ACCOUNT_DEFAULT_FORM });

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const rules = computed<FormRules<AccountFormModel>>(() => ({
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  password: props.mode === 'create' ? [{ required: true, message: '请输入初始密码', trigger: 'blur' }] : [],
  roleIds: [{ required: true, type: 'array', message: '请选择角色', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
}));

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    Object.assign(form, ACCOUNT_DEFAULT_FORM, props.initialData ?? {});
  }
);

async function handleSubmit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}
</script>
