export interface DailyTaskFilters {
  keyword: string;
  tenantId: string;
  platform: string;
  /** 任务归属团长，非仅佣金接收团长。 */
  distributionGroupId: string;
  status: string;
  /** ''=全部；true=仅测试任务；false=仅普通任务。 */
  isTestData: '' | 'true' | 'false';
  /** 测试批次 ID：只按明确归属筛选，不递归推导成员或团队。 */
  testBatchId: string;
  /** 历史清理范围直达：逗号分隔的任务 ID。 */
  ids: string;
}

export interface DailyTaskFormModel {
  tenantId: string;
  mediaAccountId: string;
  platform: string;
  title: string;
  videoUrl: string;
  backupVideoUrls: string[];
  coverFileId: string;
  coverUrl: string;
  copywriting: string;
  commentRequirement: string;
  commentExample: string;
  targetCommentCount: number;
  /** 成员端可见金额（由后端根据任务金额和分佣方式计算）。 */
  rewardAmount: number;
  /** 管理端输入任务金额，单位为分；开启分佣时它是包含或另计分佣的计价基数。 */
  taskBudgetAmount: number;
  status: string;
  distributionScope: string;
  distributionGroupId: string;
  /** 历史兼容：新任务固定 false，不再支持跨团队协作领取。 */
  allowGroupCollaboration: boolean;
  commissionEnabled: boolean;
  /** 旧规则引用字段保留仅用于读取历史任务。 */
  commissionRuleId: string;
  /** PERCENT=基点，FIXED=分；后端只保存任务级快照。 */
  commissionRuleType: 'PERCENT' | 'FIXED';
  commissionRuleValue: number;
  /** PC 输入展示值：PERCENT 为百分数，FIXED 为元。 */
  commissionRuleDisplayValue: number;
  commissionMode: 'INCLUDED' | 'EXTRA';
  /** 正式任务为空；测试任务必须归属明确测试批次。 */
  testBatchId: string;
  commissionLocked?: boolean;
  remark: string;
  commentItems: Array<{ text: string }>;
}

export interface CommentFormModel {
  content: string;
  source: string;
  status: string;
  regionCode: string;
}

export interface AiGenerateFormModel {
  messageContent: string;
  useConversationContext: boolean;
  count: number;
  videoTitle: string;
  videoUrl: string;
  videoContent: string;
  accountPositioning: string;
  videoStyle: string;
  videoScript: string;
  targetAudience: string;
  audiencePainPoint: string;
  operationGoal: string;
  platform: string;
  customSystemPrompt: string;
  customUserPrompt: string;
}
