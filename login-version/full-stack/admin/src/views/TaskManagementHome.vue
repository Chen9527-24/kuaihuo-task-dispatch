<template>
  <div class="desk">
    <section class="desk-banner">
      <div>
        <p>{{ auth.isPlatformAdmin ? '全部租户' : (auth.tenantName || '当前租户') }}</p>
        <h1>任务分发管理</h1>
        <span>配置视频与评论池，跟进成员提交和奖励发放。</span>
      </div>
      <div class="banner-actions">
        <RouterLink v-if="allowed('/daily-tasks')" class="primary-action" to="/daily-tasks">管理任务 <span aria-hidden="true">→</span></RouterLink>
        <a href="/deployment.html" target="_blank" rel="noopener">部署准备清单 ↗</a>
      </div>
    </section>

    <section v-if="canSeeTasks || canSeeMembers || canSeeWithdrawals" class="figures" aria-label="当前管理范围">
      <RouterLink v-if="canSeeTasks" to="/daily-tasks">
        <span>任务总数</span><strong>{{ totalTasks ?? '—' }}</strong>
      </RouterLink>
      <RouterLink v-if="canSeeMembers" to="/app-users">
        <span>团队成员</span><strong>{{ totalMembers ?? '—' }}</strong>
      </RouterLink>
      <RouterLink v-if="canSeeWithdrawals" to="/withdrawals">
        <span>待审核提现</span><strong>{{ pendingWithdrawals ?? '—' }}</strong>
      </RouterLink>
    </section>

    <div class="desk-columns">
      <section class="desk-panel">
        <div class="section-heading"><h2>最近任务</h2><el-button v-if="canSeeTasks" text :loading="loading" @click="loadOverview">刷新</el-button></div>
        <p v-if="!canSeeTasks" class="panel-note">当前账号没有任务查看权限。</p>
        <p v-else-if="taskError" class="panel-note">{{ taskError }}</p>
        <p v-else-if="!tasks.length && !loading" class="panel-note">还没有任务。先在「媒体账号」添加作品所属账号，再到「任务与评论池」新建第一条任务。</p>
        <ul v-else class="recent-list" v-loading="loading">
          <li v-for="task in tasks" :key="task.id">
            <div><RouterLink v-if="allowed('/task-orders')" :to="{path:'/task-orders',query:{taskId:task.id}}">{{ task.title }}</RouterLink><strong v-else>{{ task.title }}</strong><small>{{ task.mediaAccount?.accountName || '未设置媒体账号' }}</small></div>
            <span>{{ statusName(task.status) }}</span>
          </li>
        </ul>
      </section>
      <section class="desk-panel">
        <div class="section-heading"><h2>业务入口</h2></div>
        <nav aria-label="业务入口" class="operation-list">
          <RouterLink v-for="entry in visibleEntries" :key="entry.path" :to="entry.path">
            <div><strong>{{ entry.name }}</strong><small>{{ entry.note }}</small></div><span aria-hidden="true">→</span>
          </RouterLink>
        </nav>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { listDailyTasks, type DailyTaskItem } from '@/api/modules/dailyTasks';
import { listAppUsers } from '@/api/modules/appUsers';
import { listWithdrawals } from '@/api/modules/withdrawals';
import { canAccessMenuPath } from '@/router/menu';
import { useAuthStore } from '@/stores/auth';
import { DAILY_TASK_STATUS_FALLBACKS } from '@/views/dailytaskmanagement/constants';

defineOptions({name: 'TaskManagementHome'});
const auth = useAuthStore();
const allowed = (path: string) => canAccessMenuPath(path, auth.user.permissions, auth.isPlatformAdmin);
const canRead = (permission: string) => auth.isPlatformAdmin || auth.user.permissions.includes(permission);
const canSeeTasks = computed(() => allowed('/daily-tasks') && canRead('daily-task:read'));
const canSeeMembers = computed(() => allowed('/app-users') && canRead('app-user:read'));
const canSeeWithdrawals = computed(() => allowed('/withdrawals') && canRead('withdrawal:read'));
const entries = [
  {path:'/task-orders', name:'订单审核与结算', note:'查看领取记录、审核截图、确认实际奖励金额'},
  {path:'/withdrawals', name:'奖励提现', note:'处理成员提现申请，跟踪支付结果'},
  {path:'/distribution-groups', name:'团队与团长', note:'管理邀请码、团长申请和佣金记录'},
  {path:'/media-accounts', name:'媒体账号', note:'为任务关联作品所属的平台账号'},
];
const visibleEntries = computed(() => entries.filter(entry => allowed(entry.path)));
const tasks = ref<DailyTaskItem[]>([]);
const totalTasks = ref<number | null>(null);
const totalMembers = ref<number | null>(null);
const pendingWithdrawals = ref<number | null>(null);
const loading = ref(false);
const taskError = ref('');

function statusName(value: string) {
  return DAILY_TASK_STATUS_FALLBACKS.find(item => item.value === value)?.label ?? value;
}

async function loadOverview() {
  if (loading.value) return;
  loading.value = true;
  taskError.value = '';
  const requests = [];
  if (canSeeTasks.value) {
    requests.push(listDailyTasks({page:1,pageSize:5}).then(result => {
      tasks.value = result.items;
      totalTasks.value = result.total;
    }).catch(() => {
      totalTasks.value = null;
      taskError.value = '任务列表读取失败，请刷新重试。';
    }));
  }
  if (canSeeMembers.value) {
    requests.push(listAppUsers({page:1,pageSize:1,memberOnly:'true'})
      .then(result => { totalMembers.value = result.total; }).catch(() => { totalMembers.value = null; }));
  }
  if (canSeeWithdrawals.value) {
    requests.push(listWithdrawals({page:1,pageSize:1,status:'PENDING'})
      .then(result => { pendingWithdrawals.value = result.total; }).catch(() => { pendingWithdrawals.value = null; }));
  }
  try { await Promise.all(requests); }
  finally { loading.value = false; }
}
onMounted(loadOverview);
</script>

<style scoped>
.desk { display:grid; gap:18px; max-width:1440px; margin:0 auto; }
.desk-banner { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:34px clamp(20px,3.5vw,48px); border-radius:18px; color:#f5fcf8; background:linear-gradient(115deg,#103e36,#24634c); }
.desk-banner p { color:#bddfd1; font-size:14px; margin:0 0 7px; }
.desk-banner h1 { margin:0 0 11px; font-size:clamp(26px,3vw,41px); font-weight:650; line-height:1.2; }
.desk-banner > div > span { font-size:14px; color:#ddede5; }
.banner-actions { flex-shrink:0; display:flex; flex-direction:column; align-items:flex-end; gap:10px; font-size:13px; }
.primary-action { padding:10px 16px; border-radius:8px; color:#113b31; background:#f4fcf6; font-size:14px; font-weight:650; }
.primary-action span { margin-left:12px; }
.figures { display:flex; flex-wrap:wrap; border:1px solid var(--el-border-color-lighter); background:var(--el-bg-color); border-radius:14px; }
.figures a { flex:1; min-width:130px; padding:17px 24px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.figures strong { font-size:26px; font-weight:650; }
.figures a + a { border-left:1px solid var(--el-border-color-lighter); }
.figures span, .desk small, .panel-note { color:var(--el-text-color-secondary); }
.desk-columns { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(260px,.85fr); gap:18px; align-items:start; }
.desk-panel { border:1px solid var(--el-border-color-lighter); border-radius:14px; background:var(--el-bg-color); padding:12px 22px 14px; }
.section-heading { min-height:41px; display:flex; align-items:center; justify-content:space-between; }
.section-heading h2 { font-size:17px; font-weight:650; }
.panel-note { font-size:14px; line-height:1.8; padding:14px 0 8px; }
.recent-list li, .operation-list a { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:13px 0; border-top:1px solid var(--el-border-color-lighter); }
.recent-list li > div { min-width:0; }
.recent-list a, .operation-list strong { display:block; font-size:14px; font-weight:600; }
.recent-list a { overflow-wrap:anywhere; }
.recent-list li > span { white-space:nowrap; font-size:12px; color:var(--el-text-color-secondary); }
.desk small { display:block; font-size:12px; margin-top:4px; }
.desk a:hover { color:var(--el-color-primary); }
.desk-banner a:hover { color:#c7eace; }
.desk-banner .primary-action:hover { color:#155d40; }
@media (max-width:900px) { .desk-columns { grid-template-columns:1fr; } }
@media (max-width:600px) { .desk-banner { flex-direction:column; align-items:flex-start; } .banner-actions { flex-direction:row; align-items:center; gap:18px; } .figures a { padding:12px; min-width:90px; flex-direction:column; align-items:flex-start; } }
</style>
