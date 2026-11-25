import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 通用分页查询参数，所有列表接口尽量复用。 */
export class PaginationDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize: number = 10;
}

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export function getPagination(dto: PaginationDto, options: { maxPageSize?: number; defaultPageSize?: number } = {}) {
  const rawPage = Number(dto.page ?? 1);
  const defaultPageSize = Math.max(1, Math.trunc(options.defaultPageSize ?? 10));
  const maxPageSize = Math.max(defaultPageSize, Math.trunc(options.maxPageSize ?? 500));
  const rawPageSize = Number(dto.pageSize ?? defaultPageSize);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.trunc(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize) ? Math.min(maxPageSize, Math.max(1, Math.trunc(rawPageSize))) : defaultPageSize;
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
