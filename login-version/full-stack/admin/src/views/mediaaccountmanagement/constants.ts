export const MEDIA_ACCOUNT_DEFAULT_FORM = {
  tenantId: '',
  platform: '',
  accountId: '',
  accountName: '',
  status: 'ENABLED',
  positioning: '',
  remark: ''
};

export const ENABLED_STATUS_FALLBACKS = [
  { label: '启用', value: 'ENABLED', color: 'green' },
  { label: '禁用', value: 'DISABLED', color: 'red' }
];

export const MEDIA_PLATFORM_FALLBACKS = [
  { label: '抖音', value: 'DOUYIN' },
  { label: '微信视频号', value: 'WECHAT_VIDEO' },
  { label: '小红书', value: 'XIAOHONGSHU' }
];
