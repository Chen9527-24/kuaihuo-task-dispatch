import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import type { Express } from 'express';
import { getPagination } from '../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser, resolveTenantId } from '../../common/utils/tenant-scope';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user-admin.dto';
import { UserQueryDto } from './dto/user-query.dto';

const authUserInclude = {
  tenant: true,
  memberships: {
    include: {
      tenant: true,
    },
  },
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type AuthUserPayload = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

export type SafeUser = CurrentUserPayload & {
  phone: string | null;
};

@Injectable()
export class UsersService {
  private static readonly PERMANENT_EXPIRED_AT = new Date('9999-12-31T23:59:59.999Z');

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
  ) {}

  async findAuthUserByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: authUserInclude,
    });
  }

  async findSafeUserById(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: authUserInclude });
    if (!user) throw new NotFoundException('User not found');
    return this.toSafeUser(user);
  }

  async findSessionUserById(id: string, requestedTenantId?: string | null) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: authUserInclude });
    if (!user || user.status !== 'ENABLED') {
      throw new UnauthorizedException('账号不可用');
    }

    const accessibleMemberships = this.getAccessibleMemberships(user);
    const activeMembership =
      (requestedTenantId ? accessibleMemberships.find((item) => item.tenantId === requestedTenantId) : null) ??
      (user.tenantId ? accessibleMemberships.find((item) => item.tenantId === user.tenantId) : null) ??
      accessibleMemberships.find((item) => item.isDefault) ??
      accessibleMemberships[0] ??
      null;

    if (requestedTenantId && !activeMembership) {
      // Switching tenant is an account-membership operation, not a platform-role shortcut.
      // Platform administrators may have broad management permissions after switching,
      // but they still cannot create a tenant session for an unbound tenant.
      throw new UnauthorizedException('当前账号无权访问该租户');
    }

    if (!activeMembership) {
      throw new UnauthorizedException('当前账号没有可用租户');
    }

    return this.toSafeUser(user, { activeTenantId: activeMembership.tenantId });
  }

  async list(query: UserQueryDto, currentUser: CurrentUserPayload) {
    const { skip, take, page, pageSize } = getPagination(query);
    const tenantId = resolveTenantId(currentUser, query.tenantId);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(tenantId ? { memberships: { some: { tenantId, status: 'ENABLED' } } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.phone ? { phone: { contains: query.phone } } : {}),
      ...(query.keyword
        ? {
            OR: [
              { username: { contains: query.keyword, mode: 'insensitive' } },
              { displayName: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: authUserInclude,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((user) => this.toSafeUser(user, { activeTenantId: tenantId ?? null })),
      page,
      pageSize,
      total,
    };
  }

  async create(dto: CreateUserDto, operator: CurrentUserPayload) {
    const tenantIds = await this.resolveCreateTenantIds(operator, dto);
    if (!tenantIds.length && !isPlatformUser(operator)) {
      throw new BadRequestException('tenantId is required');
    }

    const roleIds = await this.resolveAssignableRoleIds(operator, dto.roleIds, tenantIds);
    const passwordHash = await hash(dto.password, 10);
    const avatarFile = dto.avatarFileId ? await this.filesService.getFile(dto.avatarFileId) : null;
    const defaultTenantId = tenantIds[0] ?? null;
    const user = await this.prisma.user.create({
      data: {
        tenantId: defaultTenantId,
        username: dto.username,
        passwordHash,
        displayName: dto.displayName,
        phone: dto.phone,
        avatarFileId: dto.avatarFileId,
        avatarUrl: avatarFile?.url,
        status: dto.status ?? 'ENABLED',
        remark: dto.remark,
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
        ...(tenantIds.length
          ? {
              memberships: {
                create: tenantIds.map((tenantId, index) => ({
                  tenantId,
                  status: 'ENABLED',
                  isDefault: index === 0,
                })),
              },
            }
          : {}),
      },
      include: authUserInclude,
    });

    if (dto.avatarFileId) {
      await this.filesService.activateAndBind(dto.avatarFileId, { bizType: 'USER', bizId: user.id, fieldName: 'avatar' });
    }

    return this.toSafeUser(user);
  }

  async detail(id: string, currentUser?: CurrentUserPayload) {
    // 平台级账号可以跨租户管理账号；租户级账号仍只能读取当前租户内的账号。
    // 不能把平台账号自身的默认 tenantId 当作目标账号的强制范围，
    // 否则平台账号编辑其他租户成员时会被误判为“User not found”。
    const tenantId = currentUser && !isPlatformUser(currentUser) ? resolveTenantId(currentUser) : undefined;
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(tenantId ? { memberships: { some: { tenantId, status: 'ENABLED' } } } : {}),
      },
      include: authUserInclude,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toSafeUser(user, { activeTenantId: tenantId ?? null });
  }

  async update(id: string, dto: UpdateUserDto, operator: CurrentUserPayload) {
    const current = await this.detail(id, operator);
    const tenantIds = await this.resolveUpdateTenantIds(operator, dto);
    const targetTenantIds = isPlatformUser(operator)
      ? (tenantIds ?? current.tenants.map((item) => item.tenantId))
      : (operator.tenantId ? [operator.tenantId] : []);
    const roleIds = dto.roleIds === undefined
      ? undefined
      : await this.resolveAssignableRoleIds(operator, dto.roleIds, targetTenantIds);
    const avatarFile = dto.avatarFileId ? await this.filesService.getFile(dto.avatarFileId) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (roleIds !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (roleIds.length) {
          await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })), skipDuplicates: true });
        }
      }

      if (tenantIds !== undefined) {
        await tx.userTenantMembership.deleteMany({ where: { userId: id } });
        if (tenantIds.length) {
          await tx.userTenantMembership.createMany({
            data: tenantIds.map((tenantId, index) => ({
              userId: id,
              tenantId,
              status: 'ENABLED',
              isDefault: index === 0,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(tenantIds !== undefined ? { tenantId: tenantIds[0] ?? null } : {}),
          displayName: dto.displayName,
          phone: dto.phone,
          status: dto.status,
          remark: dto.remark,
          avatarFileId: dto.avatarFileId,
          ...(avatarFile ? { avatarUrl: avatarFile.url } : {}),
        },
        include: authUserInclude,
      });
    });

    if (dto.avatarFileId) {
      await this.filesService.activateAndBind(dto.avatarFileId, { bizType: 'USER', bizId: id, fieldName: 'avatar' });
    }

    return this.toSafeUser(updated);
  }

  async updateStatus(id: string, status: string, currentUser: CurrentUserPayload) {
    await this.detail(id, currentUser);
    return this.prisma.user.update({ where: { id }, data: { status }, select: { id: true, username: true, status: true } });
  }

  async resetPassword(id: string, dto: ResetPasswordDto, currentUser: CurrentUserPayload) {
    await this.detail(id, currentUser);
    const passwordHash = await hash(dto.password, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
  }

  async remove(id: string, currentUser: CurrentUserPayload) {
    await this.detail(id, currentUser);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: 'DISABLED' } });
    return { success: true };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updated = await this.prisma.user.update({ where: { id: userId }, data: dto, include: authUserInclude });
    return this.toSafeUser(updated);
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const saved = await this.filesService.upload(userId, file, 'USER_AVATAR');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarFileId: saved.id, avatarUrl: saved.url },
      include: authUserInclude,
    });
    await this.filesService.activateAndBind(saved.id, { bizType: 'USER', bizId: userId, fieldName: 'avatar' });
    return this.toSafeUser(updated);
  }

  toSafeUser(
    user: AuthUserPayload,
    options?: {
      activeTenantId?: string | null;
      activeTenantName?: string | null;
    },
  ): SafeUser {
    const activeMembership = this.resolveActiveMembership(user, options?.activeTenantId);
    const activeTenantId = options?.activeTenantId ?? activeMembership?.tenantId ?? user.tenantId ?? null;
    const activeTenantName = options?.activeTenantName ?? activeMembership?.tenant.name ?? user.tenant?.name ?? null;
    const roles = [
      ...new Set(
        user.roles
          .filter((item) => this.isRoleAvailableInTenant(item.role, activeTenantId))
          .map((item) => item.role.code),
      ),
    ];
    const permissions = [
      ...new Set(
        user.roles
          .filter((item) => this.isRoleAvailableInTenant(item.role, activeTenantId))
          .flatMap((item) =>
            item.role.permissions
              .filter((permissionItem) => permissionItem.permission.status === 'ENABLED')
              .map((permissionItem) => permissionItem.permission.code),
          ),
      ),
    ];

    return {
      id: user.id,
      tenantId: activeTenantId,
      tenantName: activeTenantName,
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      status: user.status,
      roles,
      permissions,
      tenants: this.getAccessibleMemberships(user).map((item) => ({
        membershipId: item.id,
        tenantId: item.tenantId,
        tenantName: item.tenant.name,
        tenantCode: item.tenant.code,
        isDefault: item.isDefault,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private ensureTenantSessionAvailable(tenant: AuthUserPayload['tenant']) {
    if (!tenant) {
      return;
    }
    if (!this.isTenantSessionAvailable(tenant)) {
      throw new UnauthorizedException('租户已禁用');
    }
  }

  private async resolveCreateTenantIds(operator: CurrentUserPayload, dto: CreateUserDto) {
    const requestedTenantIds = dto.tenantIds?.length ? dto.tenantIds : dto.tenantId ? [dto.tenantId] : undefined;
    if (!isPlatformUser(operator)) {
      return operator.tenantId ? [operator.tenantId] : [];
    }
    return this.validateTenantIds(requestedTenantIds ?? []);
  }

  private async resolveUpdateTenantIds(operator: CurrentUserPayload, dto: UpdateUserDto) {
    const requestedTenantIds =
      dto.tenantIds !== undefined ? dto.tenantIds : dto.tenantId !== undefined ? [dto.tenantId] : undefined;
    if (requestedTenantIds === undefined) {
      return undefined;
    }
    if (!isPlatformUser(operator)) {
      return operator.tenantId ? [operator.tenantId] : [];
    }
    return this.validateTenantIds(requestedTenantIds);
  }

  private async resolveAssignableRoleIds(operator: CurrentUserPayload, requestedRoleIds: string[], targetTenantIds: string[]) {
    const roleIds = [...new Set(requestedRoleIds.map((item) => item.trim()).filter(Boolean))];
    if (!roleIds.length) {
      return [];
    }

    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, status: 'ENABLED' },
      select: { id: true, scope: true, tenantId: true },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('存在无效或已停用的角色');
    }

    if (!isPlatformUser(operator)) {
      const activeTenantId = operator.tenantId;
      if (!activeTenantId) {
        throw new ForbiddenException('当前账号没有有效租户，不能分配角色');
      }
      const forbiddenRole = roles.find((role) => role.scope !== 'TENANT' || (role.tenantId && role.tenantId !== activeTenantId));
      if (forbiddenRole) {
        throw new ForbiddenException('租户账号只能分配当前租户可用的租户角色');
      }
      return roleIds;
    }

    const incompatibleTenantRole = roles.find(
      (role) => role.scope === 'TENANT' && role.tenantId && !targetTenantIds.includes(role.tenantId),
    );
    if (incompatibleTenantRole) {
      throw new BadRequestException('指定租户角色必须与账号所属租户一致');
    }
    return roleIds;
  }

  private async validateTenantIds(tenantIds: string[]) {
    const normalizedTenantIds = [...new Set(tenantIds.map((item) => item.trim()).filter(Boolean))];
    if (!normalizedTenantIds.length) {
      return [];
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: normalizedTenantIds }, deletedAt: null },
      select: { id: true },
    });
    if (tenants.length !== normalizedTenantIds.length) {
      throw new BadRequestException('存在无效的租户 ID');
    }
    return normalizedTenantIds;
  }

  private resolveActiveMembership(user: AuthUserPayload, activeTenantId?: string | null) {
    const memberships = this.getAccessibleMemberships(user);
    return (
      (activeTenantId ? memberships.find((item) => item.tenantId === activeTenantId) : null) ??
      (user.tenantId ? memberships.find((item) => item.tenantId === user.tenantId) : null) ??
      memberships.find((item) => item.isDefault) ??
      memberships[0] ??
      null
    );
  }

  private getAccessibleMemberships(user: AuthUserPayload) {
    return user.memberships.filter(
      (item) => item.status === 'ENABLED' && item.tenant && this.isTenantSessionAvailable(item.tenant),
    );
  }

  private isRoleAvailableInTenant(role: AuthUserPayload['roles'][number]['role'], activeTenantId: string | null) {
    if (role.status !== 'ENABLED') {
      return false;
    }
    if (role.scope === 'PLATFORM') {
      return true;
    }

    // TENANT 角色默认是可复用的租户角色模板：账号切换到任一已绑定租户时均可生效。
    // 仅当角色显式绑定了 tenantId 时，才把它限定到该单一租户。
    return !!activeTenantId && (!role.tenantId || role.tenantId === activeTenantId);
  }

  private isTenantSessionAvailable(tenant: NonNullable<AuthUserPayload['tenant']>) {
    if (tenant.deletedAt || tenant.status !== 'ACTIVE') {
      return false;
    }
    if (!this.isPermanentExpiredAt(tenant.expiredAt) && tenant.expiredAt.getTime() <= Date.now()) {
      return false;
    }
    return true;
  }

  private isPermanentExpiredAt(value: Date) {
    return value.getTime() === UsersService.PERMANENT_EXPIRED_AT.getTime();
  }
}
