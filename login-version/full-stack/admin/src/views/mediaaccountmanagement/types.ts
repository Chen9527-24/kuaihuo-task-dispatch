export interface MediaAccountFilters {
  keyword: string;
  tenantId: string;
  platform: string;
  status: string;
}

export interface MediaAccountFormModel {
  tenantId: string;
  platform: string;
  accountId: string;
  accountName: string;
  status: string;
  positioning: string;
  remark: string;
}
