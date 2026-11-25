<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增权限' : '编辑权限'" width="760px" destroy-on-close>
    <el-alert class="mb-4" type="info" :closable="false" title="权限层级固定为：顶级目录 → 菜单 → 按钮。目录和菜单用于导航与授权树，接口校验只使用按钮权限。" />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="105px">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <el-form-item label="权限类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择类型" class="w-full">
            <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="上级权限" prop="parentId">
          <el-select v-model="form.parentId" class="w-full" clearable :disabled="form.type === 'DIRECTORY'" :placeholder="parentPlaceholder">
            <el-option v-for="item in allowedParents" :key="item.id" :label="`${item.name}（${item.code}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限编码" prop="code">
          <el-input v-model="form.code" placeholder="例如 daily-task:create" :disabled="mode === 'edit'" />
        </el-form-item>
        <el-form-item label="权限名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入权限名称" />
        </el-form-item>
        <el-form-item label="权限分组">
          <el-input v-model="form.group" placeholder="例如 daily-task" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" placeholder="请选择状态" class="w-full">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <template v-if="form.type === 'MENU'">
          <el-form-item label="路由路径">
            <el-input v-model="form.routePath" placeholder="/daily-tasks" />
          </el-form-item>
          <el-form-item label="组件标识">
            <el-input v-model="form.component" placeholder="DailyTaskManagementView" />
          </el-form-item>
        </template>
        <el-form-item v-if="form.type !== 'BUTTON'" label="图标">
          <el-input v-model="form.icon" placeholder="菜单图标标识" />
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
      <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { PermissionItem } from '@/api/modules/permissions';
import type { SelectOption } from '@/utils/apiData';
import { PERMISSION_DEFAULT_FORM } from '../constants';
import type { PermissionFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<PermissionFormModel>;
  permissionTree: PermissionItem[];
  typeOptions: SelectOption[];
  statusOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; submit: [payload: PermissionFormModel] }>();

const formRef = ref<FormInstance>();
const form = reactive<PermissionFormModel>({ ...PERMISSION_DEFAULT_FORM });
const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) });
const allNodes = computed(() => flatten(props.permissionTree));
const requiredParentType = computed(() => (form.type === 'MENU' ? 'DIRECTORY' : form.type === 'BUTTON' ? 'MENU' : ''));
const allowedParents = computed(() => allNodes.value.filter((item) => item.type === requiredParentType.value));
const parentPlaceholder = computed(() => {
  if (form.type === 'DIRECTORY') return '顶级目录无上级';
  return form.type === 'MENU' ? '请选择所属目录' : '请选择所属菜单';
});

const rules: FormRules<PermissionFormModel> = {
  code: [{ required: true, message: '请输入权限编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择权限类型', trigger: 'change' }],
  parentId: [{ validator: (_rule, value, callback) => {
    if (form.type !== 'DIRECTORY' && !String(value || '').trim()) {
      callback(new Error(form.type === 'MENU' ? '菜单必须选择所属目录' : '按钮必须选择所属菜单'));
      return;
    }
    callback();
  }, trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};

watch(() => props.modelValue, (open) => {
  if (!open) return;
  Object.assign(form, PERMISSION_DEFAULT_FORM, props.initialData ?? {});
});

watch(() => form.type, () => {
  if (form.type === 'DIRECTORY') form.parentId = '';
  else if (!allowedParents.value.some((item) => item.id === form.parentId)) form.parentId = '';
  if (form.type !== 'MENU') {
    form.routePath = '';
    form.component = '';
  }
  if (form.type === 'BUTTON') form.icon = '';
});

async function handleSubmit() {
  await formRef.value?.validate();
  emit('submit', { ...form });
}

function flatten(nodes: PermissionItem[]): PermissionItem[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}
</script>
