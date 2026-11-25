import type { DailyTaskFormModel } from './types';

export const DAILY_TASK_DEFAULT_FORM: DailyTaskFormModel = {
  tenantId: '',
  mediaAccountId: '',
  platform: '',
  title: '',
  videoUrl: '',
  backupVideoUrls: [],
  coverFileId: '',
  coverUrl: '',
  copywriting: '',
  commentRequirement: '',
  commentExample: '',
  targetCommentCount: 10,
  rewardAmount: 100,
  taskBudgetAmount: 100,
  status: 'DRAFT',
  distributionScope: 'TENANT',
  distributionGroupId: '',
  allowGroupCollaboration: false,
  commissionEnabled: false,
  commissionRuleId: '',
  commissionRuleType: 'PERCENT',
  commissionRuleValue: 0,
  commissionRuleDisplayValue: 0,
  commissionMode: 'EXTRA',
  testBatchId: '',
  remark: '',
  commentItems: []
};

export const AI_COMMENT_CONFIG_DEFAULT_FORM = {
  messageContent: '请基于当前配置生成评论运营数据，主题必须紧贴当前视频，语气像评论区真实留言，严格返回 rows JSON。',
  useConversationContext: true,
  count: 5,
  videoTitle: '',
  videoUrl: '',
  videoContent: '',
  accountPositioning: '',
  videoStyle: '',
  videoScript: '',
  targetAudience: '',
  audiencePainPoint: '',
  operationGoal: '提升视频曝光，带动评论区互动，营造讨论氛围',
  platform: '',
  customSystemPrompt: '',
  customUserPrompt: ''
};

export const AI_COMMENT_CONFIG_PRESET_FORM = {
  ...AI_COMMENT_CONFIG_DEFAULT_FORM,
  videoTitle: '操作步骤演示',
  videoContent: '视频依次展示打开任务、领取内容和提交反馈。',
  accountPositioning: '产品体验与使用说明',
  videoStyle: '界面操作演示',
  videoScript: '打开演示页面，阅读任务要求，查看当前进度。',
  targetAudience: '第一次参与产品体验的成员',
  audiencePainPoint: '需要知道操作顺序和反馈入口',
  operationGoal: '整理页面易用性反馈',
  platform: '本地演示',
  customSystemPrompt: '根据演示视频拟写反馈问题。',
  customUserPrompt: '请给出关于操作顺序和页面提示的问题。'
};

export const DAILY_TASK_STATUS_FALLBACKS = [
  { label: '草稿', value: 'DRAFT', color: 'gray' },
  { label: '待发布', value: 'READY', color: 'blue' },
  { label: '已发推流', value: 'DISPATCHED', color: 'purple' },
  { label: '执行中', value: 'RUNNING', color: 'orange' },
  { label: '已暂停', value: 'PAUSED', color: 'orange' },
  { label: '已关闭', value: 'CLOSED', color: 'gray' },
  { label: '已归档', value: 'ARCHIVED', color: 'gray' },
  { label: '已完成', value: 'COMPLETED', color: 'green' },
  { label: '已取消', value: 'CANCELLED', color: 'red' },
  { label: '已停用', value: 'DISABLED', color: 'red' }
];

export const TASK_COMMENT_STATUS_FALLBACKS = [
  { label: '可领取', value: 'AVAILABLE', color: 'blue' },
  { label: '已领取', value: 'CLAIMED', color: 'orange' },
  { label: '已完成', value: 'COMPLETED', color: 'green' },
  { label: '已作废', value: 'INVALID', color: 'red' }
];

export const COMMENT_SOURCE_FALLBACKS = [
  { label: '手动', value: 'MANUAL' },
  { label: 'AI', value: 'AI' },
  { label: '导入', value: 'IMPORT' }
];

export const MEDIA_PLATFORM_FALLBACKS = [
  { label: '抖音', value: 'DOUYIN' },
  { label: '微信视频号', value: 'WECHAT_VIDEO' },
  { label: '小红书', value: 'XIAOHONGSHU' }
];
