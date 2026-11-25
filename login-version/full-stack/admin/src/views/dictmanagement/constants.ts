export const DICT_TYPE_DEFAULT_FORM = {
  code: '',
  name: '',
  status: 'ENABLED',
  remark: ''
};

export const DICT_ITEM_DEFAULT_FORM = {
  typeCode: '',
  label: '',
  value: '',
  color: '',
  sort: 0,
  status: 'ENABLED',
  remark: ''
};

export const ENABLED_STATUS_FALLBACKS = [
  { label: '启用', value: 'ENABLED', color: 'green' },
  { label: '禁用', value: 'DISABLED', color: 'red' }
];

export const COLOR_OPTIONS = [
  { label: '绿色', value: 'green' },
  { label: '红色', value: 'red' },
  { label: '蓝色', value: 'blue' },
  { label: '橙色', value: 'orange' },
  { label: '紫色', value: 'purple' },
  { label: '灰色', value: 'gray' }
];
