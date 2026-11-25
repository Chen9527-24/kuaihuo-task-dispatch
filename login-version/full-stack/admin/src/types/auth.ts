export interface AuthUser {
  id: string;
  name: string;
  account: string;
  email: string;
  role: string;
  avatar: string;
  avatarUrl: string;
  bio: string;
  roles: string[];
  permissions: string[];
}

export interface AuthTenant {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  isDefault: boolean;
}

/**
 * A device-local remembered session. It contains a refresh token only; the
 * browser never stores a password. Each account remembers its own last tenant.
 */
export interface SavedAuthAccount {
  key: string;
  userId: string;
  account: string;
  name: string;
  avatar: string;
  avatarUrl: string;
  role: string;
  tenantId: string;
  tenantName: string;
  tenants: AuthTenant[];
  refreshToken: string;
  lastUsedAt: string;
}

export const defaultAuthUser: AuthUser = {
  id: '',
  name: '未登录用户',
  account: '',
  email: '',
  role: '未分配角色',
  avatar: 'U',
  avatarUrl: '',
  bio: '登录后可查看当前账号资料、权限和文件信息。',
  roles: [],
  permissions: []
};

export const defaultAuthTenant: AuthTenant = {
  membershipId: '',
  tenantId: '',
  tenantName: '',
  tenantCode: '',
  isDefault: false
};
