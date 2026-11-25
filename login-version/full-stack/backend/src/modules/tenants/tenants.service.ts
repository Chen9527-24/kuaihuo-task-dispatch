import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';

@Injectable()
export class TenantsService {
  private static readonly PERMANENT_EXPIRED_AT = new Date('9999-12-31T23:59:59.999Z');

  constructor(private readonly prisma: PrismaService) {}

  async list(query: TenantQueryDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { industry: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items: items.map((item) => this.serializeTenant(item)), page, pageSize, total };
  }

  async options(user: CurrentUserPayload) {
    if (!isPlatformUser(user)) {
      return user.tenants.map((tenant) => ({
        label: tenant.tenantName,
        value: tenant.tenantId,
        code: tenant.tenantCode,
      }));
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, code: true },
    });
    return tenants.map((tenant) => ({ label: tenant.name, value: tenant.id, code: tenant.code }));
  }

  async detail(id: string) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) throw new NotFoundException('租户不存在');
    return this.serializeTenant(tenant);
  }

  async create(dto: CreateTenantDto) {
    const tenant = await this.prisma.tenant.create({
      data: {
        ...dto,
        status: dto.status ?? 'ACTIVE',
        code: this.generateTenantCode(dto.name),
        startedAt: new Date(dto.startedAt),
        expiredAt: this.toTenantExpiredAt(dto.expiredAt),
      },
    });
    return this.serializeTenant(tenant);
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.detail(id);
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startedAt ? { startedAt: new Date(dto.startedAt) } : {}),
        ...(dto.expiredAt !== undefined ? { expiredAt: this.toTenantExpiredAt(dto.expiredAt) } : {}),
      },
    });
    return this.serializeTenant(tenant);
  }

  async updateStatus(id: string, status: string) {
    await this.detail(id);
    return this.prisma.tenant.update({ where: { id }, data: { status } });
  }

  async remove(id: string) {
    await this.detail(id);
    await this.prisma.tenant.update({ where: { id }, data: { deletedAt: new Date(), status: 'DISABLED' } });
    return { success: true };
  }

  private generateTenantCode(name: string) {
    const safePrefix = name.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 8).toUpperCase() || 'TENANT';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(10000 + Math.random() * 90000);
    return `QF-${safePrefix}-${date}-${random}`;
  }

  private toTenantExpiredAt(value?: string) {
    return value ? new Date(value) : TenantsService.PERMANENT_EXPIRED_AT;
  }

  private serializeTenant<T extends { expiredAt: Date }>(tenant: T) {
    return {
      ...tenant,
      expiredAt: this.isPermanentExpiredAt(tenant.expiredAt) ? null : tenant.expiredAt,
    };
  }

  private isPermanentExpiredAt(value: Date) {
    return value.getTime() === TenantsService.PERMANENT_EXPIRED_AT.getTime();
  }
}
