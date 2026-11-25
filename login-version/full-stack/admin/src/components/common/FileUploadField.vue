<template>
  <div class="space-y-3">
    <el-upload
      :show-file-list="false"
      :http-request="handleUpload"
      :before-upload="beforeUpload"
      :accept="accept"
    >
      <div
        class="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-purple-400 dark:border-slate-700 dark:bg-slate-800"
      >
        <img v-if="previewUrl" :src="previewUrl" class="h-full w-full object-cover" />
        <div v-else class="text-center text-xs">
          <el-icon class="mb-1 text-xl"><Plus /></el-icon>
          <div>{{ placeholder }}</div>
        </div>
      </div>
    </el-upload>
    <div v-if="fileName" class="text-xs text-slate-500">{{ fileName }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import * as filesApi from '@/api/modules/files';
import { resolveAssetUrl } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    url?: string;
    scene?: string;
    accept?: string;
    maxSizeMb?: number;
    placeholder?: string;
  }>(),
  {
    accept: 'image/*',
    maxSizeMb: 5,
    placeholder: '上传'
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:url': [value: string];
  uploaded: [payload: filesApi.UploadFileResponse];
}>();

const uploading = ref(false);
const localUrl = ref('');
const fileName = ref('');

const previewUrl = computed(() => resolveAssetUrl(localUrl.value || props.url));

function beforeUpload(file: File) {
  if (props.maxSizeMb && file.size > props.maxSizeMb * 1024 * 1024) {
    ElMessage.warning(`文件不能超过 ${props.maxSizeMb}MB`);
    return false;
  }
  return true;
}

async function handleUpload(options: unknown) {
  const file = (options as { file?: File }).file;
  if (!file) return;

  uploading.value = true;
  try {
    const result = await filesApi.uploadFile(file, props.scene);
    fileName.value = result.originalName || file.name;
    localUrl.value = result.url || result.fullUrl || '';
    emit('update:modelValue', result.id);
    emit('update:url', result.url || result.fullUrl || '');
    emit('uploaded', result);
    ElMessage.success('上传成功');
  } finally {
    uploading.value = false;
  }
}
</script>
