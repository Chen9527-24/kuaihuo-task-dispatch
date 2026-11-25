import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';

@Injectable()
export class OperationLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: OperationLogQueryDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.OperationLogWhereInput = {
      ...(query.module ? { module: query.module } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.operationLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.operationLog.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async record(params: {
    operatorId: string;
    tenantId?: string | null;
    module: string;
    action: string;
    bizId?: string;
    description?: string;
    beforeData?: Prisma.InputJsonValue;
    afterData?: Prisma.InputJsonValue;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.operationLog.create({ data: params });
  }
}
