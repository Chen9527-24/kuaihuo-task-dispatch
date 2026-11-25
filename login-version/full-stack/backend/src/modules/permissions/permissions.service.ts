import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';
import { PermissionQueryDto } from './dto/permission-query.dto';

type PermissionNode = Prisma.PermissionGetPayload<{}> & { children: PermissionNode[] };
type PermissionType = 'DIRECTORY' | 'MENU' | 'BUTTON';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PermissionQueryDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.PermissionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.keyword
        ? { OR: [{ code: { contains: query.keyword, mode: 'insensitive' } }, { name: { contains: query.keyword, mode: 'insensitive' } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.permission.findMany({ where, skip, take, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.permission.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  /**
   * 角色授权与权限管理共用的可用权限树。
   * 退役的历史权限保留在数据库中，但不会混入日常授权界面。
   */
  async tree(includeDisabled = false) {
    const permissions = await this.prisma.permission.findMany({
      where: includeDisabled ? {} : { status: 'ENABLED' },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
    const nodeMap = new Map<string, PermissionNode>();
    permissions.forEach((permission) => nodeMap.set(permission.id, { ...permission, children: [] }));

    const roots: PermissionNode[] = [];
    nodeMap.forEach((node) => {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(node);
      } else if (node.type === 'DIRECTORY') {
        // 只允许目录成为根节点，历史遗留的根按钮/根菜单不会再污染授权树。
        roots.push(node);
      }
    });
    return roots;
  }

  async detail(id: string) {
    const permission = await this.prisma.permission.findUnique({ where: { id }, include: { children: true } });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

  async create(dto: CreatePermissionDto) {
    const type = this.normalizeType(dto.type);
    const parentId = dto.parentId?.trim() || null;
    await this.assertHierarchy(type, parentId);

    return this.prisma.permission.create({
      data: {
        parentId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        group: dto.group?.trim() || dto.code.split(':')[0] || 'system',
        type,
        status: dto.status ?? 'ENABLED',
        sort: dto.sort ?? 0,
        routePath: dto.routePath?.trim() || null,
        component: dto.component?.trim() || null,
        icon: dto.icon?.trim() || null,
        remark: dto.remark?.trim() || null,
      },
    });
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const current = await this.detail(id);
    const type = this.normalizeType(dto.type ?? current.type);
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId?.trim() || null;
    await this.assertHierarchy(type, parentId, id);
    await this.assertExistingChildrenCompatible(id, type);

    return this.prisma.permission.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.group !== undefined ? { group: dto.group.trim() || current.group } : {}),
        ...(dto.type !== undefined ? { type } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.sort !== undefined ? { sort: dto.sort } : {}),
        ...(dto.routePath !== undefined ? { routePath: dto.routePath?.trim() || null } : {}),
        ...(dto.component !== undefined ? { component: dto.component?.trim() || null } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon?.trim() || null } : {}),
        ...(dto.remark !== undefined ? { remark: dto.remark?.trim() || null } : {}),
        parentId,
      },
    });
  }

  async updateStatus(id: string, status: string) {
    await this.detail(id);
    return this.prisma.permission.update({ where: { id }, data: { status } });
  }

  async remove(id: string) {
    const permission = await this.detail(id);
    if (permission.children.length > 0) throw new BadRequestException('请先删除或迁移下级权限');
    await this.prisma.permission.delete({ where: { id } });
    return { success: true };
  }

  private normalizeType(value: string): PermissionType {
    if (value === 'DIRECTORY' || value === 'MENU' || value === 'BUTTON') return value;
    throw new BadRequestException('权限类型必须是目录、菜单或按钮');
  }

  private async assertExistingChildrenCompatible(id: string, type: PermissionType) {
    const children = await this.prisma.permission.findMany({ where: { parentId: id }, select: { type: true } });
    if (!children.length) return;
    const expectedChildType = type === 'DIRECTORY' ? 'MENU' : type === 'MENU' ? 'BUTTON' : null;
    if (!expectedChildType || children.some((child) => child.type !== expectedChildType)) {
      throw new BadRequestException('当前节点已有下级权限，不能改为会破坏目录→菜单→按钮层级的类型');
    }
  }

  /** 只允许 目录 → 菜单 → 按钮，防止再次产生全部根节点按钮的脏树。 */
  private async assertHierarchy(type: PermissionType, parentId: string | null, selfId?: string) {
    if (type === 'DIRECTORY') {
      if (parentId) throw new BadRequestException('顶级目录不能设置上级权限');
      return;
    }

    if (!parentId) {
      throw new BadRequestException(type === 'MENU' ? '菜单必须归属一个顶级目录' : '按钮必须归属一个菜单');
    }
    if (parentId === selfId) throw new BadRequestException('上级权限不能是自身');

    const parent = await this.prisma.permission.findUnique({ where: { id: parentId }, select: { id: true, type: true, parentId: true } });
    if (!parent) throw new NotFoundException('上级权限不存在');

    const expectedParentType = type === 'MENU' ? 'DIRECTORY' : 'MENU';
    if (parent.type !== expectedParentType) {
      throw new BadRequestException(type === 'MENU' ? '菜单只能挂在顶级目录下' : '按钮只能挂在菜单下');
    }

    if (selfId) {
      let cursor: typeof parent | null = parent;
      while (cursor?.parentId) {
        if (cursor.parentId === selfId) throw new BadRequestException('不能把权限移动到自身的下级节点');
        cursor = await this.prisma.permission.findUnique({ where: { id: cursor.parentId }, select: { id: true, type: true, parentId: true } });
      }
    }
  }
}
