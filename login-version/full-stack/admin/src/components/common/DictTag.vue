<template>
  <el-tag :type="tagTypeByColor(option?.color)" effect="light" round>
    {{ option?.label || value || '--' }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SelectOption } from '@/utils/apiData';
import { tagTypeByColor } from '@/utils/format';

const props = defineProps<{
  value?: string | null;
  options?: SelectOption[];
}>();

const option = computed(() => props.options?.find((item) => item.value === props.value));
</script>
