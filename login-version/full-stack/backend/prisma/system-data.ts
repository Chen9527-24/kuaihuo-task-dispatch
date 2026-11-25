import { PrismaClient } from '@prisma/client';

type PermissionSeed = {
  code: string;
  name: string;
  group: string;
  type: 'DIRECTORY' | 'MENU' | 'BUTTON';
  parentCode?: string;
  routePath?: string;
  component?: string;
  icon?: string;
  sort: number;
};

/**
 * 后台权限唯一基线：三个顶级目录 → 菜单 → 按钮。
 * 目录/菜单是授权树与前端导航结构；真正的接口拦截仍以按钮编码为准。
 */
export const permissionSeeds: PermissionSeed[] = [
  // 顶级目录
  { code: 'directory:operation', name: '运营业务', group: 'operation', type: 'DIRECTORY', icon: 'Grid', sort: 10 },
  { code: 'directory:system', name: '系统管理', group: 'system', type: 'DIRECTORY', icon: 'Setting', sort: 50 },

  // 运营业务菜单
  { code: 'menu:daily-tasks', name: '每日任务', group: 'daily-task', type: 'MENU', parentCode: 'directory:operation', routePath: '/daily-tasks', component: 'DailyTaskManagementView', icon: 'List', sort: 10 },
  { code: 'menu:distribution-groups', name: '团长管理', group: 'distribution-group', type: 'MENU', parentCode: 'directory:operation', routePath: '/distribution-groups', component: 'DistributionGroupManagementView', icon: 'Connection', sort: 20 },
  { code: 'menu:app-users', name: 'H5成员', group: 'app-user', type: 'MENU', parentCode: 'directory:operation', routePath: '/app-users', component: 'AppUserManagementView', icon: 'UserFilled', sort: 30 },
  { code: 'menu:withdrawals', name: '提现管理', group: 'withdrawal', type: 'MENU', parentCode: 'directory:operation', routePath: '/withdrawals', component: 'WithdrawalManagementView', icon: 'Money', sort: 50 },
  { code: 'menu:media-accounts', name: '多媒体账号', group: 'media-account', type: 'MENU', parentCode: 'directory:operation', routePath: '/media-accounts', component: 'MediaAccountManagementView', icon: 'VideoCamera', sort: 60 },




  // 系统管理菜单
  { code: 'menu:tenants', name: '租户管理', group: 'tenant', type: 'MENU', parentCode: 'directory:system', routePath: '/tenants', component: 'TenantManagementView', icon: 'OfficeBuilding', sort: 10 },
  { code: 'menu:accounts', name: '账号管理', group: 'user', type: 'MENU', parentCode: 'directory:system', routePath: '/accounts', component: 'AccountManagementView', icon: 'User', sort: 20 },
  { code: 'menu:roles', name: '角色管理', group: 'role', type: 'MENU', parentCode: 'directory:system', routePath: '/roles', component: 'RoleManagementView', icon: 'UserFilled', sort: 30 },
  { code: 'menu:permissions', name: '权限管理', group: 'permission', type: 'MENU', parentCode: 'directory:system', routePath: '/permissions', component: 'PermissionManagementView', icon: 'Lock', sort: 40 },
  { code: 'menu:dicts', name: '数据字典', group: 'dict', type: 'MENU', parentCode: 'directory:system', routePath: '/dicts', component: 'DictManagementView', icon: 'Collection', sort: 50 },
  { code: 'menu:profile', name: '个人中心', group: 'user', type: 'MENU', parentCode: 'directory:system', routePath: '/profile', component: 'ProfileView', icon: 'Avatar', sort: 60 },

  // 每日任务：页面默认可访问；以下仅控制页面内按钮与操作接口。
  { code: 'daily-task:read', name: '查看任务详情', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 10 },
  { code: 'daily-task:create', name: '新增每日任务', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 20 },
  { code: 'daily-task:update', name: '编辑/暂停/关闭任务', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 30 },
  { code: 'daily-task:delete', name: '删除每日任务', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 40 },
  { code: 'daily-task:dispatch', name: '发布推流任务', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 50 },
  { code: 'daily-task:progress:read', name: '查看任务进度', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 60 },
  { code: 'daily-task:order:read', name: '查看任务订单', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 70 },
  { code: 'daily-task:order:settle', name: '审核/结算订单', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 80 },
  { code: 'daily-task:comment:read', name: '查看评论配置', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 90 },
  { code: 'daily-task:comment:create', name: '新增任务评论', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 100 },
  { code: 'daily-task:comment:update', name: '编辑任务评论', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 110 },
  { code: 'daily-task:comment:delete', name: '删除任务评论', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 120 },
  { code: 'daily-task:comment:ai-generate', name: 'AI生成任务评论', group: 'daily-task', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 130 },
  { code: 'file:upload', name: '上传任务文件', group: 'file', type: 'BUTTON', parentCode: 'menu:daily-tasks', sort: 140 },

  // 团长管理
  { code: 'distribution-group:read', name: '查看团长与团队', group: 'distribution-group', type: 'BUTTON', parentCode: 'menu:distribution-groups', sort: 10 },
  { code: 'distribution-group:create', name: '新增团长与团队', group: 'distribution-group', type: 'BUTTON', parentCode: 'menu:distribution-groups', sort: 20 },
  { code: 'distribution-group:update', name: '编辑团长与团队', group: 'distribution-group', type: 'BUTTON', parentCode: 'menu:distribution-groups', sort: 30 },
  { code: 'distribution-group:delete', name: '删除团长与团队', group: 'distribution-group', type: 'BUTTON', parentCode: 'menu:distribution-groups', sort: 40 },

  // H5成员
  { code: 'app-user:read', name: '查看H5成员', group: 'app-user', type: 'BUTTON', parentCode: 'menu:app-users', sort: 10 },
  { code: 'app-user:update', name: '编辑H5成员', group: 'app-user', type: 'BUTTON', parentCode: 'menu:app-users', sort: 20 },
  { code: 'app-user:restrict', name: '限制H5成员接单', group: 'app-user', type: 'BUTTON', parentCode: 'menu:app-users', sort: 30 },
  { code: 'app-user:delete', name: '删除H5成员', group: 'app-user', type: 'BUTTON', parentCode: 'menu:app-users', sort: 40 },




  // 提现
  { code: 'withdrawal:read', name: '查看提现记录', group: 'withdrawal', type: 'BUTTON', parentCode: 'menu:withdrawals', sort: 10 },
  { code: 'withdrawal:update', name: '处理提现记录', group: 'withdrawal', type: 'BUTTON', parentCode: 'menu:withdrawals', sort: 20 },

  // 多媒体账号
  { code: 'media-account:read', name: '查看多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 10 },
  { code: 'media-account:create', name: '新增多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 20 },
  { code: 'media-account:update', name: '编辑多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 30 },
  { code: 'media-account:delete', name: '删除多媒体账号', group: 'media-account', type: 'BUTTON', parentCode: 'menu:media-accounts', sort: 40 },



  // 系统管理
  { code: 'tenant:read', name: '查看租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 10 },
  { code: 'tenant:create', name: '新增租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 20 },
  { code: 'tenant:update', name: '编辑租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 30 },
  { code: 'tenant:delete', name: '删除租户', group: 'tenant', type: 'BUTTON', parentCode: 'menu:tenants', sort: 40 },
  { code: 'user:read', name: '查看账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 10 },
  { code: 'user:create', name: '新增账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 20 },
  { code: 'user:update', name: '编辑账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 30 },
  { code: 'user:delete', name: '删除账号', group: 'user', type: 'BUTTON', parentCode: 'menu:accounts', sort: 40 },
  { code: 'role:read', name: '查看角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 10 },
  { code: 'role:create', name: '新增角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 20 },
  { code: 'role:update', name: '编辑角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 30 },
  { code: 'role:delete', name: '删除角色', group: 'role', type: 'BUTTON', parentCode: 'menu:roles', sort: 40 },
  { code: 'permission:read', name: '查看权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 10 },
  { code: 'permission:create', name: '新增权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 20 },
  { code: 'permission:update', name: '编辑权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 30 },
  { code: 'permission:delete', name: '删除权限', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 40 },
  { code: 'rbac:read', name: '查看RBAC概览', group: 'permission', type: 'BUTTON', parentCode: 'menu:permissions', sort: 50 },
  { code: 'dict:read', name: '查看数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 10 },
  { code: 'dict:create', name: '新增数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 20 },
  { code: 'dict:update', name: '编辑数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 30 },
  { code: 'dict:delete', name: '删除数据字典', group: 'dict', type: 'BUTTON', parentCode: 'menu:dicts', sort: 40 },
  { code: 'user:profile:read', name: '查看个人资料', group: 'user', type: 'BUTTON', parentCode: 'menu:profile', sort: 10 },
  { code: 'user:profile:update', name: '编辑个人资料', group: 'user', type: 'BUTTON', parentCode: 'menu:profile', sort: 20 },
  { code: 'file:mine:read', name: '查看我的文件', group: 'file', type: 'BUTTON', parentCode: 'menu:profile', sort: 30 },
];

// 已废弃的旧测试批次/强制清理入口保留数据库历史，但不再出现在日常权限树。
const retiredPermissionCodes = [
  'daily-task:test-data:reset',
  'test-data-batch:read',
  'test-data-batch:create',
  'test-data-batch:update',
  'test-data-batch:purge',
  'sms:send',
  'operation-log:read',
] as const;

type DictSeed = Array<{ code: string; name: string; items: Array<{ label: string; value: string; color?: string; sort: number }> }>;

export const dictSeed: DictSeed = [
  {
    code: 'enabled_status',
    name: '启用状态',
    items: [
      { label: '启用', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'tenant_status',
    name: '租户状态',
    items: [
      { label: '激活', value: 'ACTIVE', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
      { label: '已过期', value: 'EXPIRED', color: 'orange', sort: 3 },
    ],
  },
  {
    code: 'user_status',
    name: '用户状态',
    items: [
      { label: '启用', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'role_status',
    name: '角色状态',
    items: [
      { label: '启用', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '禁用', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'permission_type',
    name: '权限类型',
    items: [
      { label: '目录', value: 'DIRECTORY', sort: 1 },
      { label: '菜单', value: 'MENU', sort: 2 },
      { label: '按钮', value: 'BUTTON', sort: 3 },
    ],
  },
  {
    code: 'permission_validation_status',
    name: '权限校验状态',
    items: [
      { label: '开启', value: 'ENABLED', color: 'green', sort: 1 },
      { label: '关闭', value: 'DISABLED', color: 'red', sort: 2 },
    ],
  },
  {
    code: 'media_platform',
    name: '多媒体平台',
    items: [
      { label: '抖音', value: 'DOUYIN', sort: 1 },
      { label: '微信视频号', value: 'WECHAT_VIDEO', sort: 2 },
      { label: '小红书', value: 'XIAOHONGSHU', sort: 3 },
    ],
  },
  {
    code: 'daily_task_status',
    name: '每日任务状态',
    items: [
      { label: '草稿', value: 'DRAFT', color: 'gray', sort: 1 },
      { label: '待发布', value: 'READY', color: 'blue', sort: 2 },
      { label: '已发推流', value: 'DISPATCHED', color: 'purple', sort: 3 },
      { label: '执行中', value: 'RUNNING', color: 'orange', sort: 4 },
      { label: '已暂停', value: 'PAUSED', color: 'orange', sort: 5 },
      { label: '已关闭', value: 'CLOSED', color: 'gray', sort: 6 },
      { label: '已归档', value: 'ARCHIVED', color: 'gray', sort: 7 },
      { label: '已完成', value: 'COMPLETED', color: 'green', sort: 8 },
      { label: '已取消', value: 'CANCELLED', color: 'red', sort: 9 },
      { label: '已停用', value: 'DISABLED', color: 'red', sort: 10 },
    ],
  },
  {
    code: 'task_comment_status',
    name: '任务评论状态',
    items: [
      { label: '未配置', value: 'UNCONFIGURED', color: 'gray', sort: 1 },
      { label: '可领取', value: 'AVAILABLE', color: 'blue', sort: 2 },
      { label: '已领取', value: 'CLAIMED', color: 'orange', sort: 3 },
      { label: '已完成', value: 'COMPLETED', color: 'green', sort: 4 },
      { label: '已作废', value: 'INVALID', color: 'red', sort: 5 },
    ],
  },
  {
    code: 'comment_source',
    name: '评论来源',
    items: [
      { label: '手动', value: 'MANUAL', sort: 1 },
      { label: 'AI', value: 'AI', sort: 2 },
      { label: '导入', value: 'IMPORT', sort: 3 },
    ],
  },
  {
    code: 'task_participant_status',
    name: '任务参与状态',
    items: [
      { label: '已开始', value: 'STARTED', color: 'blue', sort: 1 },
      { label: '已领取', value: 'CLAIMED', color: 'orange', sort: 2 },
      { label: '已完成', value: 'COMPLETED', color: 'green', sort: 3 },
      { label: '已取消', value: 'CANCELLED', color: 'red', sort: 4 },
    ],
  },
  {
    code: 'task_settlement_status',
    name: '任务结算状态',
    items: [
      { label: '未结算', value: 'UNSETTLED', color: 'orange', sort: 1 },
      { label: '已结算', value: 'SETTLED', color: 'green', sort: 2 },
    ],
  },
  {
    code: 'dispatch_status',
    name: '推流状态',
    items: [
      { label: '处理中', value: 'PENDING', color: 'blue', sort: 1 },
      { label: '成功', value: 'SUCCESS', color: 'green', sort: 2 },
      { label: '失败', value: 'FAILED', color: 'red', sort: 3 },
    ],
  },
  {
    code: 'file_scene',
    name: '文件场景',
    items: [
      { label: '用户头像', value: 'USER_AVATAR', sort: 1 },
      { label: '任务封面', value: 'TASK_COVER', sort: 2 },
      { label: '租户附件', value: 'TENANT_ATTACHMENT', sort: 3 },
      { label: '任务领取凭证', value: 'TASK_CLAIM_PROOF', sort: 4 },
      { label: '任务结算凭证', value: 'TASK_SETTLEMENT_PROOF', sort: 5 },
    ],
  },
];

export async function syncSystemDicts(prisma: PrismaClient) {
  for (const type of dictSeed) {
    await prisma.dictType.upsert({
      where: { code: type.code },
      update: { name: type.name, status: 'ENABLED' },
      create: { code: type.code, name: type.name, status: 'ENABLED' },
    });

    for (const item of type.items) {
      await prisma.dictItem.upsert({
        where: { typeCode_value: { typeCode: type.code, value: item.value } },
        update: { label: item.label, color: item.color ?? null, sort: item.sort, status: 'ENABLED' },
        create: { typeCode: type.code, label: item.label, value: item.value, color: item.color ?? null, sort: item.sort, status: 'ENABLED' },
      });
    }
  }
}

export async function syncSystemAccessControl(prisma: PrismaClient) {
  const permissionMap = new Map<string, { id: string }>();

  // 必须按目录 → 菜单 → 按钮顺序 upsert，才能在同一次同步中安全绑定 parentId。
  for (const permission of permissionSeeds) {
    const parentId = permission.parentCode ? permissionMap.get(permission.parentCode)?.id : null;
    if (permission.parentCode && !parentId) {
      throw new Error(`权限父节点不存在：${permission.parentCode}`);
    }

    const saved = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        parentId,
        name: permission.name,
        group: permission.group,
        type: permission.type,
        status: 'ENABLED',
        sort: permission.sort,
        routePath: permission.routePath ?? null,
        component: permission.component ?? null,
        icon: permission.icon ?? null,
      },
      create: {
        parentId,
        code: permission.code,
        name: permission.name,
        group: permission.group,
        type: permission.type,
        status: 'ENABLED',
        sort: permission.sort,
        routePath: permission.routePath ?? null,
        component: permission.component ?? null,
        icon: permission.icon ?? null,
      },
      select: { id: true },
    });
    permissionMap.set(permission.code, saved);
  }

  // 历史测试批次权限不删除，避免破坏历史角色关联；仅退役并从日常授权树隐藏。
  await prisma.permission.updateMany({
    where: { code: { in: [...retiredPermissionCodes] } },
    data: { status: 'DISABLED', parentId: null },
  });

  const adminRole = await prisma.role.upsert({
    where: { code: 'admin' },
    update: { name: '超级管理员', scope: 'PLATFORM', status: 'ENABLED' },
    create: { code: 'admin', name: '超级管理员', scope: 'PLATFORM', status: 'ENABLED' },
  });

  const tenantAdminRole = await prisma.role.upsert({
    where: { code: 'tenant_admin' },
    update: { name: '租户管理员', scope: 'TENANT', status: 'ENABLED' },
    create: { code: 'tenant_admin', name: '租户管理员', scope: 'TENANT', status: 'ENABLED' },
  });

  const tenantUserRole = await prisma.role.upsert({
    where: { code: 'tenant_user' },
    update: { name: '租户使用人', scope: 'TENANT', status: 'ENABLED' },
    create: { code: 'tenant_user', name: '租户使用人', scope: 'TENANT', status: 'ENABLED' },
  });

  const allPermissionCodes = permissionSeeds.map((item) => item.code);
  const tenantPermissionCodes = allPermissionCodes.filter((code) =>
    [
      'directory:operation',
      'directory:system',
      'menu:daily-tasks',
      'menu:distribution-groups',
      'menu:app-users',
      'menu:withdrawals',
      'menu:media-accounts',
      'menu:profile',
      'user:profile',
      'file:',
      'media-account:',
      'app-user:',
      'daily-task:',
      'distribution-group:',
      'withdrawal:',
    ].some((prefix) => code.startsWith(prefix)),
  );

  await assignRolePermissions(prisma, adminRole.id, allPermissionCodes.map((code) => permissionMap.get(code)!.id));
  await assignRolePermissions(prisma, tenantAdminRole.id, tenantPermissionCodes.map((code) => permissionMap.get(code)!.id));
  await assignRolePermissions(
    prisma,
    tenantUserRole.id,
    tenantPermissionCodes
      .filter((code) => !code.endsWith(':delete') && code !== 'daily-task:order:settle')
      .map((code) => permissionMap.get(code)!.id),
  );

  return { adminRole, tenantAdminRole, tenantUserRole };
}

async function assignRolePermissions(prisma: PrismaClient, roleId: string, permissionIds: string[]) {
  await Promise.all(
    permissionIds.map((permissionId) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      }),
    ),
  );
}
