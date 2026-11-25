export interface DictTypeFilters {
  keyword: string;
  status: string;
}

export interface DictItemFilters {
  typeCode: string;
  keyword: string;
  status: string;
}

export interface DictTypeFormModel {
  code: string;
  name: string;
  status: string;
  remark: string;
}

export interface DictItemFormModel {
  typeCode: string;
  label: string;
  value: string;
  color: string;
  sort: number;
  status: string;
  remark: string;
}
