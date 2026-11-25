<template>
  <el-dialog v-model="visible" :title="mode === 'create' ? '新增角色' : '编辑角色'" width="760px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="95px">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="form.code" placeholder="例如 tenant_admin" :disabled="mode === 'edit'" />
        </el-form-item>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="角色范围" prop="scope">
          <el-select v-model="form.scope" class="w-full" placeholder="请选择角色范围">
            <el-option v-for="item in scopeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" class="w-full" placeholder="请选择状态">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </div>
      <el-form-item label="角色说明">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="请输入角色说明" />
      </el-form-item>
      <el-alert
        v-if="form.scope === 'TENANT'"
        class="mb-4"
        type="info"
        :closable="false"
        title="租户角色是可复用模板：账号登录到其已绑定的租户后生效；角色本身不再额外绑定某一个租户。"
      />
      <el-form-item label="权限配置">
        <div class="w-full rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
          <el-tree
            :key="treeVersion"
            ref="treeRef"
            :data="permissionTree"
            node-key="id"
            show-checkbox
            :default-expanded-keys="defaultExpandedKeys"
            :expand-on-click-node="false"
            :props="{ label: 'name', children: 'children' }"
            :default-checked-keys="form.permissionIds"
          >
            <template #default="{ data }">
              <span class="flex min-w-0 items-center gap-2 py-0.5">
                <el-tag size="small" effect="plain" :type="typeTagType(data.type)">{{ typeLabel(data.type) }}</el-tag>
                <span class="truncate">{{ data.name }}</span>
                <span class="hidden text-xs text-slate-400 md:inline">{{ data.code }}</span>
              </span>
            </template>
          </el-tree>
        </div>
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
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { SelectOption } from '@/utils/apiData';
import type { PermissionItem } from '@/api/modules/permissions';
import { ROLE_DEFAULT_FORM, ROLE_SCOPE_OPTIONS } from '../constants';
import type { RoleFormModel } from '../types';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<RoleFormModel>;
  permissionTree: PermissionItem[];
  statusOptions: SelectOption[];
  submitting?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  submit: [payload: RoleFormModel];
}>();

const formRef = ref<FormInstance>();
const treeRef = ref<{
  getCheckedKeys: () => Array<string | number>;
  setCheckedKeys: (keys: string[]) => void;
}>();

const form = reactive<RoleFormModel>({ ...ROLE_DEFAULT_FORM });
const scopeOptions = ROLE_SCOPE_OPTIONS;
const treeVersion = ref(0);
const defaultExpandedKeys = computed(() => props.permissionTree.filter((item) => item.code === 'directory:operation').map((item) => item.id));

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});

const rules: FormRules<RoleFormModel> = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  scope: [{ required: true, message: '请选择角色范围', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    Object.assign(form, ROLE_DEFAULT_FORM, props.initialData ?? {});
    await nextTick();
    treeVersion.value += 1;
    treeRef.value?.setCheckedKeys(form.permissionIds);
  }
);

function typeLabel(type: string) {
  if (type === 'DIRECTORY') return '目录';
  if (type === 'MENU') return '菜单';
  return '按钮';
}

function typeTagType(type: string) {
  if (type === 'DIRECTORY') return 'success';
  if (type === 'MENU') return 'primary';
  return 'info';
}

async function handleSubmit() {
  await formRef.value?.validate();
  // Element Plus 默认父子联动：勾选目录会选中所有菜单和按钮，勾选菜单会选中其按钮。
  // 半选节点不单独写入，避免只勾一个按钮时被误扩展为整组授权。
  const checked = (treeRef.value?.getCheckedKeys() ?? []).map(String);
  emit('submit', { ...form, permissionIds: [...new Set(checked)] });
}
</script>
