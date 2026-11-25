import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser, resolveRequiredTenantId, resolveTenantId, resolveVisibleTenantId } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMediaAccountDto, UpdateMediaAccountDto } from './dto/media-account.dto';
import { MediaAccountOptionsQueryDto, MediaAccountQueryDto } from './dto/media-account-query.dto';

@Injectable()
export class MediaAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MediaAccountQueryDto, user: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveVisibleTenantId(user, query.tenantId);
    const where: Prisma.MediaAccountWhereInput = {
      deletedAt: null,
      ...(tenantId ? { tenantId } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { accountName: { contains: query.keyword, mode: 'insensitive' } },
              { accountId: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.mediaAccount.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { tenant: true } }),
      this.prisma.mediaAccount.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async options(query: MediaAccountOptionsQueryDto, user: CurrentUserPayload) {
    const tenantId = resolveVisibleTenantId(user, query.tenantId);
    const accounts = await this.prisma.mediaAccount.findMany({
      where: {
        deletedAt: null,
        status: 'ENABLED',
        ...(tenantId ? { tenantId } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, platform: true, accountId: true, accountName: true, tenantId: true },
    });
    return accounts.map((account) => ({
      label: account.accountName,
      value: account.id,
      platform: account.platform,
      accountId: account.accountId,
      tenantId: account.tenantId,
    }));
  }

  async detail(id: string, user: CurrentUserPayload) {
    const tenantId = isPlatformUser(user) ? undefined : resolveTenantId(user);
    const account = await this.prisma.mediaAccount.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      include: { tenant: true },
    });
    if (!account) throw new NotFoundException('Media account not found');
    return account;
  }

  async create(dto: CreateMediaAccountDto, user: CurrentUserPayload) {
    const tenantId = resolveRequiredTenantId(user, dto.tenantId);
    const data = this.normalizePayload(dto);
    await this.ensureAccountUnique({ tenantId, platform: data.platform, accountId: data.accountId });

    try {
      return await this.prisma.mediaAccount.create({
        data: { ...data, tenantId, status: data.status ?? 'ENABLED' },
      });
    } catch (error) {
      this.throwFriendlyUniqueError(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateMediaAccountDto, user: CurrentUserPayload) {
    const current = await this.detail(id, user);
    const data = this.normalizePayload(dto);
    const nextPlatform = data.platform ?? current.platform;
    const nextAccountId = data.accountId ?? current.accountId;
    await this.ensureAccountUnique({
      tenantId: current.tenantId,
      platform: nextPlatform,
      accountId: nextAccountId,
      excludeId: id,
    });

    try {
      return await this.prisma.mediaAccount.update({ where: { id }, data });
    } catch (error) {
      this.throwFriendlyUniqueError(error);
      throw error;
    }
  }

  async updateStatus(id: string, status: string, user: CurrentUserPayload) {
    await this.detail(id, user);
    return this.prisma.mediaAccount.update({ where: { id }, data: { status } });
  }

  async remove(id: string, user: CurrentUserPayload) {
    await this.detail(id, user);
    await this.prisma.mediaAccount.update({ where: { id }, data: { deletedAt: new Date(), status: 'DISABLED' } });
    return { success: true };
  }

  private normalizePayload<T extends CreateMediaAccountDto | UpdateMediaAccountDto>(dto: T): T {
    const normalized = { ...dto };
    if (normalized.platform) normalized.platform = normalized.platform.trim();
    if (normalized.accountId) normalized.accountId = normalized.accountId.trim();
    if (normalized.accountName) normalized.accountName = normalized.accountName.trim();
    if (normalized.positioning) normalized.positioning = normalized.positioning.trim();
    if (normalized.remark) normalized.remark = normalized.remark.trim();
    return normalized;
  }

  private async ensureAccountUnique(params: {
    tenantId: string;
    platform: string;
    accountId: string;
    excludeId?: string;
  }) {
    const exists = await this.prisma.mediaAccount.findFirst({
      where: {
        tenantId: params.tenantId,
        platform: params.platform,
        accountId: params.accountId,
        deletedAt: null,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: { id: true },
    });

    if (exists) {
      throw new ConflictException('该租户下已存在相同平台账号 ID，请更换账号 ID 或编辑已有账号');
    }
  }

  private throwFriendlyUniqueError(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('该租户下已存在相同平台账号 ID，请更换账号 ID 或编辑已有账号');
    }
  }
}
