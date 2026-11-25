import { reactive, ref } from 'vue';
import type { PageResult } from '@/utils/apiData';

const MIN_PAGE_SIZE = 10;

export interface RemoteTableState<TFilters extends object> {
  filters: TFilters;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  loading: boolean;
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function useRemoteTable<TItem, TFilters extends object>(
  initialFilters: TFilters,
  loader: (query: TFilters & { page: number; pageSize: number }) => Promise<PageResult<TItem>>,
  pageSize = 10
) {
  const items = ref<TItem[]>([]);
  const filters = reactive(clone(initialFilters)) as TFilters;
  const pagination = reactive({
    page: 1,
    pageSize: ensurePageSize(pageSize),
    total: 0
  });
  const loading = ref(false);

  async function fetchList(resetPage = false) {
    if (resetPage) pagination.page = 1;
    pagination.pageSize = ensurePageSize(pagination.pageSize);
    loading.value = true;
    try {
      const pageResult = await loader({
        ...(filters as TFilters),
        page: pagination.page,
        pageSize: pagination.pageSize
      });
      items.value = pageResult.items;
      pagination.total = pageResult.total;
      pagination.page = pageResult.page || pagination.page;
      // 保留用户在分页器中选择的 pageSize，避免接口只返回当前实际条数时把 50/页错误反写成 26/页。
      pagination.pageSize = ensurePageSize(pagination.pageSize);
    } finally {
      loading.value = false;
    }
  }

  function resetFilters() {
    Object.assign(filters, clone(initialFilters));
    return fetchList(true);
  }

  return {
    items,
    filters,
    pagination,
    loading,
    fetchList,
    resetFilters
  };
}

function ensurePageSize(value: number) {
  return Number.isFinite(value) ? Math.max(MIN_PAGE_SIZE, value) : MIN_PAGE_SIZE;
}
