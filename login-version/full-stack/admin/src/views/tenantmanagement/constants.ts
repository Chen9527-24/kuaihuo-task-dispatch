export const TENANT_DEFAULT_FORM = {
  name: '',
  status: 'ACTIVE',
  industry: '',
  productIntro: '',
  coreSellingPoint: '',
  startedAt: '',
  expiredAt: '',
  remark: ''
};

export const TENANT_STATUS_FALLBACKS = [
  { label: '激活', value: 'ACTIVE', color: 'green' },
  { label: '禁用', value: 'DISABLED', color: 'red' },
  { label: '已过期', value: 'EXPIRED', color: 'orange' }
];
