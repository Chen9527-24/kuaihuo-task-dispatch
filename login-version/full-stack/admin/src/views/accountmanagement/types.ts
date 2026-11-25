export interface AccountFilters {
  keyword: string;
  phone: string;
  tenantId: string;
  status: string;
}

export interface AccountFormModel {
  tenantIds: string[];
  username: string;
  displayName: string;
  phone: string;
  password: string;
  roleIds: string[];
  status: string;
  avatarFileId: string;
  avatarUrl: string;
  remark: string;
}
