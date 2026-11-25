<template>
  <el-drawer
    :model-value="app.settingsOpen"
    title="应用配置"
    size="380px"
    @close="app.closeSettings()"
  >
    <div class="space-y-6">
      <section>
        <div class="mb-3 text-sm font-semibold">颜色主题风格</div>
        <el-segmented
          :model-value="settings.themeMode"
          :options="themeOptions"
          @change="handleThemeModeChange"
        />
      </section>

      <section>
        <div class="mb-3 text-sm font-semibold">设计主题色</div>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="color in presetColors"
            :key="color.value"
            class="group rounded-[22px] border border-slate-200/80 p-3 text-left transition hover:-translate-y-0.5 hover:border-slate-300 dark:border-slate-700/80 dark:hover:border-slate-500"
            :style="{
              background: settings.themeColor === color.value
                ? `linear-gradient(135deg, ${color.value}14, rgba(255,255,255,0.92))`
                : ''
            }"
            @click="settings.setThemeColor(color.value)"
          >
            <div class="flex items-center gap-3">
              <span
                class="inline-flex h-11 w-11 shrink-0 rounded-2xl shadow-sm"
                :style="{ background: color.gradient }"
              />
              <span class="min-w-0">
                <div class="truncate text-sm font-semibold">{{ color.name }}</div>
                <div class="truncate text-xs text-slate-500 dark:text-slate-400">{{ color.value }}</div>
              </span>
              <span
                v-if="settings.themeColor === color.value"
                class="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white"
                :style="{ backgroundColor: color.value }"
              >
                ✓
              </span>
            </div>
          </button>
        </div>
      </section>

      <section>
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-semibold">圆角半径</span>
          <span class="text-xs text-slate-500">{{ settings.radius }}px</span>
        </div>
        <el-slider
          :model-value="settings.radius"
          :min="10"
          :max="30"
          @update:model-value="handleRadiusChange"
        />
      </section>

      <section class="space-y-4">
        <div class="text-sm font-semibold">布局开关</div>
        <div class="flex items-center justify-between">
          <span>顶栏固定</span>
          <el-switch v-model="settings.fixedHeader" />
        </div>
        <div class="flex items-center justify-between">
          <span>启用标签栏</span>
          <el-switch v-model="settings.showTabs" />
        </div>
        <div class="flex items-center justify-between">
          <span>启用快捷导航</span>
          <el-switch v-model="settings.showQuickNav" />
        </div>
      </section>

      <section>
        <div class="mb-3 text-sm font-semibold">当前配置</div>
        <el-input
          type="textarea"
          :rows="8"
          :model-value="settingsText"
          readonly
        />
      </section>

      <div class="pt-2">
        <el-button type="primary" class="w-full" @click="copyConfig">
          复制配置
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useAppStore } from '@/stores/app';
import { useSettingsStore, type ThemeMode } from '@/stores/settings';

const app = useAppStore();
const settings = useSettingsStore();

const presetColors = [
  { name: '森林绿', value: '#16a34a', gradient: 'linear-gradient(135deg, #16a34a 0%, #86efac 100%)' },
  { name: '苍穹蓝', value: '#2563eb', gradient: 'linear-gradient(135deg, #2563eb 0%, #7dd3fc 100%)' },
  { name: '深海青', value: '#0f766e', gradient: 'linear-gradient(135deg, #0f766e 0%, #5eead4 100%)' },
  { name: '暮光紫', value: '#7c3aed', gradient: 'linear-gradient(135deg, #7c3aed 0%, #c4b5fd 100%)' },
  { name: '玫瑰红', value: '#e11d48', gradient: 'linear-gradient(135deg, #e11d48 0%, #fda4af 100%)' },
  { name: '琥珀橙', value: '#ea580c', gradient: 'linear-gradient(135deg, #ea580c 0%, #fdba74 100%)' },
  { name: '鎏金黄', value: '#ca8a04', gradient: 'linear-gradient(135deg, #ca8a04 0%, #fde68a 100%)' },
  { name: '曜石黑', value: '#111827', gradient: 'linear-gradient(135deg, #111827 0%, #64748b 100%)' },
  { name: '樱雾粉', value: '#db2777', gradient: 'linear-gradient(135deg, #db2777 0%, #f9a8d4 100%)' },
  { name: '电光青', value: '#0891b2', gradient: 'linear-gradient(135deg, #0891b2 0%, #67e8f9 100%)' },
  { name: '青柠绿', value: '#65a30d', gradient: 'linear-gradient(135deg, #65a30d 0%, #bef264 100%)' },
  { name: '赤霞红', value: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626 0%, #fca5a5 100%)' }
];

const themeOptions = [
  { label: '明亮', value: 'light' },
  { label: '暗黑', value: 'dark' },
  { label: '系统', value: 'system' }
];

const settingsText = computed(() =>
  JSON.stringify(
    {
      themeMode: settings.themeMode,
      themeColor: settings.themeColor,
      radius: settings.radius,
      fixedHeader: settings.fixedHeader,
      showTabs: settings.showTabs,
      showQuickNav: settings.showQuickNav
    },
    null,
    2
  )
);

function handleThemeModeChange(value: string | number | boolean) {
  settings.setThemeMode(value as ThemeMode);
}

function handleRadiusChange(value: number | [number, number]) {
  settings.setRadius(Array.isArray(value) ? value[0] : value);
}

async function copyConfig() {
  await navigator.clipboard.writeText(settingsText.value);
  ElMessage.success('已复制配置');
}
</script>
