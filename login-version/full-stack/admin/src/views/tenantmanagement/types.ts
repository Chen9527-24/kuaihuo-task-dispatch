export interface TenantFormModel {
  name: string;
  status: string;
  industry: string;
  productIntro: string;
  coreSellingPoint: string;
  startedAt: string;
  expiredAt: string;
  remark: string;
}

export interface TenantFilters {
  keyword: string;
  status: string;
}
