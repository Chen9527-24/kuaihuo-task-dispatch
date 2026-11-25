export const ACCOUNT_DEFAULT_FORM = {
  tenantIds: [] as string[],
  username: '',
  displayName: '',
  phone: '',
  password: '',
  roleIds: [] as string[],
  status: 'ENABLED',
  avatarFileId: '',
  avatarUrl: '',
  remark: ''
};

export const USER_STATUS_FALLBACKS = [
  { label: '启用', value: 'ENABLED', color: 'green' },
  { label: '禁用', value: 'DISABLED', color: 'red' }
];
