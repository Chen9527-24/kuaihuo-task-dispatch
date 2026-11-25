<template>
  <div class="space-y-4">
    <section class="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
      <div class="panel-surface p-6 shadow-panel">
        <div class="flex flex-col items-center text-center">
          <div
            class="flex h-24 w-24 items-center justify-center rounded-[28px] text-3xl font-semibold text-white shadow-panel"
            :style="{ backgroundColor: settings.themeColor }"
          >
            <img
              v-if="form.avatarUrl"
              :src="resolveAssetUrl(form.avatarUrl)"
              :alt="auth.user.name"
              class="h-full w-full rounded-[28px] object-cover"
            />
            <template v-else>{{ previewAvatar }}</template>
          </div>
          <div class="mt-4 text-xl font-semibold">{{ auth.user.name }}</div>
          <div class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ auth.user.role }}</div>
          <div class="mt-6 grid w-full grid-cols-2 gap-3 text-left">
            <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/80">
              <div class="text-xs text-slate-500">账号</div>
              <div class="mt-2 font-medium">{{ auth.user.account }}</div>
            </div>
            <div class="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/80">
              <div class="text-xs text-slate-500">邮箱</div>
              <div class="mt-2 truncate font-medium">{{ auth.user.email }}</div>
            </div>
          </div>
        </div>

        <div class="mt-6 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {{ auth.user.bio }}
        </div>
      </div>

      <div class="panel-surface p-6 shadow-panel">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold">个人中心</div>
            <div class="mt-1 text-sm text-slate-500 dark:text-slate-400">修改昵称和头像地址，并展示当前角色权限</div>
          </div>
          <el-tag type="success">已接入接口</el-tag>
        </div>

        <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" class="mb-5" />

        <el-form label-position="top" :model="form" class="grid grid-cols-1 gap-x-5 md:grid-cols-2">
          <el-form-item label="昵称">
            <el-input v-model="form.name" placeholder="请输入昵称" />
          </el-form-item>
          <el-form-item label="账号">
            <el-input v-model="form.account" placeholder="当前账号" disabled />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" placeholder="接口返回后自动展示" disabled />
          </el-form-item>
          <el-form-item label="角色">
            <el-input v-model="form.role" placeholder="接口返回后自动展示" disabled />
          </el-form-item>
          <el-form-item label="头像地址">
            <el-input v-model="form.avatarUrl" placeholder="请输入头像图片 URL" />
          </el-form-item>
          <el-form-item label="简介" class="md:col-span-2">
            <el-input v-model="form.bio" :rows="4" type="textarea" placeholder="简介由接口数据和权限信息生成" disabled />
          </el-form-item>
          <el-form-item label="角色列表" class="md:col-span-2">
            <div class="flex flex-wrap gap-2">
              <el-tag v-for="item in auth.user.roles" :key="item" effect="plain">{{ item }}</el-tag>
              <span v-if="!auth.user.roles.length" class="text-sm text-slate-400">暂无角色数据</span>
            </div>
          </el-form-item>
          <el-form-item label="权限列表" class="md:col-span-2">
            <div class="flex flex-wrap gap-2">
              <el-tag v-for="item in auth.user.permissions" :key="item" type="info" effect="plain">{{ item }}</el-tag>
              <span v-if="!auth.user.permissions.length" class="text-sm text-slate-400">暂无权限数据</span>
            </div>
          </el-form-item>
        </el-form>

        <div class="flex flex-wrap items-center gap-3">
          <el-button type="primary" :loading="loading" @click="saveProfile">保存资料</el-button>
          <el-button @click="resetProfile">重置</el-button>
          <el-button :loading="loading" @click="reloadProfile">刷新资料</el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useAsyncState } from '@/composables/useAsyncState';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { resolveAssetUrl } from '@/utils/format';

const auth = useAuthStore();
const settings = useSettingsStore();
const { loading, errorMessage, run } = useAsyncState();

const form = reactive({
  name: auth.user.name,
  account: auth.user.account,
  email: auth.user.email,
  role: auth.user.role,
  avatar: auth.user.avatar,
  avatarUrl: auth.user.avatarUrl,
  bio: auth.user.bio
});

watch(
  () => auth.user,
  (user) => {
    form.name = user.name;
    form.account = user.account;
    form.email = user.email;
    form.role = user.role;
    form.avatar = user.avatar;
    form.avatarUrl = user.avatarUrl;
    form.bio = user.bio;
  },
  { deep: true }
);

const previewAvatar = computed(() => form.avatar.slice(0, 1).toUpperCase() || 'U');

onMounted(() => {
  if (!auth.profileLoaded) {
    reloadProfile(false);
  }
});

async function saveProfile() {
  try {
    await run(() =>
      auth.updateProfile({
        name: form.name,
        avatarUrl: form.avatarUrl
      })
    );
    ElMessage.success('个人资料已保存');
  } catch {
    // error message is shown by the alert
  }
}

async function reloadProfile(showSuccess = true) {
  try {
    await run(() => auth.fetchCurrentUserProfile());
    if (showSuccess) {
      ElMessage.success('资料已刷新');
    }
  } catch {
    // error message is shown by the alert
  }
}

function resetProfile() {
  form.name = auth.user.name;
  form.account = auth.user.account;
  form.email = auth.user.email;
  form.role = auth.user.role;
  form.avatar = auth.user.avatar;
  form.avatarUrl = auth.user.avatarUrl;
  form.bio = auth.user.bio;
}
</script>
