<template>
  <el-dialog v-model="visible" title="重置密码" width="420px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="新密码" prop="password">
        <el-input v-model="form.password" show-password placeholder="请输入新密码" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">确认重置</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

const props = defineProps<{
  modelValue: boolean;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [password: string];
}>();

const formRef = ref<FormInstance>();
const form = reactive({ password: '' });

const rules: FormRules<typeof form> = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' }
  ]
};

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) form.password = '';
  }
);

async function submit() {
  await formRef.value?.validate();
  emit('submit', form.password);
}
</script>
