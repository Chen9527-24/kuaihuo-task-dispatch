export const ROLE_DEFAULT_FORM = {
  code: '',
  name: '',
  scope: 'TENANT',
  status: 'ENABLED',
  description: '',
  remark: '',
  permissionIds: [] as string[]
};

export const ROLE_SCOPE_OPTIONS = [
  { label: '平台角色', value: 'PLATFORM' },
  { label: '租户角色', value: 'TENANT' }
];

export const ROLE_STATUS_FALLBACKS = [
  { label: '启用', value: 'ENABLED', color: 'green' },
  { label: '禁用', value: 'DISABLED', color: 'red' }
];
