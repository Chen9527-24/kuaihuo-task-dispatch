import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { isPlatformUser } from '../../common/utils/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RoleQueryDto } from './dto/role-query.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: RoleQueryDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.RoleWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.keyword
        ? { OR: [{ code: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { permissions: { include: { permission: true } } },
      }),
      this.prisma.role.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async options(user: CurrentUserPayload) {
    const where: Prisma.RoleWhereInput = { status: 'ENABLED' };

    if (!isPlatformUser(user)) {
      if (!user.tenantId) {
        return [];
      }
      // Tenant operators can assign reusable tenant-role templates and roles explicitly bound to their active tenant.
      // Platform roles and roles bound to another tenant are never exposed here.
      where.scope = 'TENANT';
      where.OR = [{ tenantId: null }, { tenantId: user.tenantId }];
    }

    const roles = await this.prisma.role.findMany({
      where,
      orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, tenantId: true, code: true, name: true, scope: true },
    });
    return roles.map((role) => ({
      label: role.name,
      value: role.id,
      code: role.code,
      scope: role.scope,
      tenantId: role.tenantId,
    }));
  }

  async detail(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          tenantId: dto.tenantId,
          code: dto.code,
          name: dto.name,
          scope: dto.scope ?? 'PLATFORM',
          status: dto.status ?? 'ENABLED',
          description: dto.description,
          remark: dto.remark,
        },
      });
      if (dto.permissionIds?.length) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }
      return tx.role.findUnique({ where: { id: role.id }, include: { permissions: { include: { permission: true } } } });
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.detail(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (dto.permissionIds.length) {
          await tx.rolePermission.createMany({ data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })), skipDuplicates: true });
        }
      }
      await tx.role.update({
        where: { id },
        data: { name: dto.name, scope: dto.scope, status: dto.status, description: dto.description, remark: dto.remark },
      });
      return tx.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    });
  }

  async updateStatus(id: string, status: string) {
    await this.detail(id);
    return this.prisma.role.update({ where: { id }, data: { status } });
  }

  async remove(id: string) {
    await this.detail(id);
    await this.prisma.role.delete({ where: { id } });
    return { success: true };
  }
}
