export const DICT_TYPES = {
  enabledStatus: 'enabled_status',
  tenantStatus: 'tenant_status',
  userStatus: 'user_status',
  roleStatus: 'role_status',
  permissionType: 'permission_type',
  permissionValidationStatus: 'permission_validation_status',
  mediaPlatform: 'media_platform',
  dailyTaskStatus: 'daily_task_status',
  taskCommentStatus: 'task_comment_status',
  commentSource: 'comment_source',
  dispatchStatus: 'dispatch_status',
  fileScene: 'file_scene'
} as const;

export type DictTypeCode = (typeof DICT_TYPES)[keyof typeof DICT_TYPES];
