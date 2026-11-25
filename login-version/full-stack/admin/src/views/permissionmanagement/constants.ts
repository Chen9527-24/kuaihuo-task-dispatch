export const PERMISSION_DEFAULT_FORM = {
  parentId: '',
  code: '',
  name: '',
  group: '',
  type: 'DIRECTORY',
  status: 'ENABLED',
  sort: 0,
  routePath: '',
  component: '',
  icon: '',
  remark: ''
};

export const PERMISSION_TYPE_FALLBACKS = [
  { label: '目录', value: 'DIRECTORY' },
  { label: '菜单', value: 'MENU' },
  { label: '按钮', value: 'BUTTON' }
];

export const PERMISSION_STATUS_FALLBACKS = [
  { label: '开启', value: 'ENABLED', color: 'green' },
  { label: '关闭', value: 'DISABLED', color: 'red' }
];
