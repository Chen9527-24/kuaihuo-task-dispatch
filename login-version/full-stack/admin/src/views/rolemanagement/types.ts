export interface RoleFilters {
  keyword: string;
  scope: string;
  status: string;
}

export interface RoleFormModel {
  code: string;
  name: string;
  scope: string;
  status: string;
  description: string;
  remark: string;
  permissionIds: string[];
}
