export interface PermissionFilters {
  keyword: string;
  type: string;
  status: string;
}

export interface PermissionFormModel {
  parentId: string;
  code: string;
  name: string;
  group: string;
  type: string;
  status: string;
  sort: number;
  routePath: string;
  component: string;
  icon: string;
  remark: string;
}
