import type { MenuItem } from '@/types';

export const menuItems: MenuItem[] = [
  { title: '任务运营', path: '/operation', icon: 'Grid', children: [
    { title: '任务工作台', path: '/task-management', icon: 'House', closable: false, alwaysVisible: true },
    { title: '任务与评论池', path: '/daily-tasks', icon: 'List', permissionCode: 'menu:daily-tasks', permissionPrefixes: ['daily-task:'] },
    { title: '订单审核与结算', path: '/task-orders', icon: 'Tickets', permissionCode: 'daily-task:order:read' },
    { title: '团队与团长', path: '/distribution-groups', icon: 'Connection', permissionCode: 'menu:distribution-groups', permissionPrefixes: ['distribution-group:'] },
    { title: 'H5 成员', path: '/app-users', icon: 'UserFilled', permissionCode: 'menu:app-users', permissionPrefixes: ['app-user:'] },
    { title: '奖励提现', path: '/withdrawals', icon: 'Money', permissionCode: 'menu:withdrawals', permissionPrefixes: ['withdrawal:'] },
    { title: '媒体账号', path: '/media-accounts', icon: 'VideoCamera', permissionCode: 'menu:media-accounts', permissionPrefixes: ['media-account:'] },
  ] },
  { title: '账号与组织', path: '/system', icon: 'Setting', children: [
    { title: '租户管理', path: '/tenants', icon: 'OfficeBuilding', permissionCode: 'menu:tenants', permissionPrefixes: ['tenant:'] },
    { title: '管理员账号', path: '/accounts', icon: 'User', permissionCode: 'menu:accounts', permissionPrefixes: ['user:read', 'user:create', 'user:update', 'user:delete'] },
    { title: '角色管理', path: '/roles', icon: 'UserFilled', permissionCode: 'menu:roles', permissionPrefixes: ['role:'] },
    { title: '权限管理', path: '/permissions', icon: 'Lock', permissionCode: 'menu:permissions', permissionPrefixes: ['permission:', 'rbac:'] },
    { title: '数据字典', path: '/dicts', icon: 'Collection', permissionCode: 'menu:dicts', permissionPrefixes: ['dict:'] },
    { title: '个人中心', path: '/profile', icon: 'Avatar', permissionCode: 'menu:profile', permissionPrefixes: ['user:profile:', 'file:mine:'] },
  ] },
];

export function getLeafMenuItems(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => (item.children?.length ? getLeafMenuItems(item.children) : [item]));
}

/** 权限树选中菜单节点，或选中该菜单任一按钮，均视为可进入该菜单。 */
function hasPermissionForNode(item: MenuItem, permissions: string[], platformAdmin: boolean) {
  if (platformAdmin || item.alwaysVisible) return true;
  if (!item.permissionCode) return false;
  if (permissions.includes(item.permissionCode)) return true;
  if (item.permissionPrefixes?.length) {
    return permissions.some((code) => item.permissionPrefixes!.some((prefix) => code.startsWith(prefix)));
  }
  return false;
}

export function getAccessibleMenuItems(items: MenuItem[], permissions: string[], platformAdmin: boolean): MenuItem[] {
  return items
    .filter((item) => !item.hidden)
    .map((item) => {
      const children = item.children?.length ? getAccessibleMenuItems(item.children, permissions, platformAdmin) : undefined;
      if (children?.length) {
        return { ...item, children };
      }
      if (item.children?.length) return null;
      return hasPermissionForNode(item, permissions, platformAdmin) ? { ...item } : null;
    })
    .filter((item): item is MenuItem => Boolean(item));
}

export function getMenuPathChain(targetPath: string, items: MenuItem[] = menuItems): string[] {
  for (const item of items) {
    if (item.path === targetPath) return [item.path];
    if (item.children?.length) {
      const childPath = getMenuPathChain(targetPath, item.children);
      if (childPath.length) return [item.path, ...childPath];
    }
  }
  return [];
}

export function findMenuItemByPath(targetPath: string, items: MenuItem[] = menuItems): MenuItem | null {
  for (const item of items) {
    if (item.path === targetPath) return item;
    if (item.children?.length) {
      const child = findMenuItemByPath(targetPath, item.children);
      if (child) return child;
    }
  }
  return null;
}

export function canAccessMenuPath(path: string, permissions: string[], platformAdmin: boolean) {
  if (path === '/task-management') return true;
  // 阅读订单需要服务端的订单查看权限。
  if (path === '/task-orders') return platformAdmin || permissions.includes('daily-task:order:read');
  const item = findMenuItemByPath(path);
  return Boolean(item && hasPermissionForNode(item, permissions, platformAdmin));
}

export function isLeafMenuPath(targetPath: string): boolean {
  return flatMenuItems.some((item) => item.path === targetPath);
}

export const flatMenuItems = getLeafMenuItems(menuItems);
