import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [roles, permissions] = await Promise.all([
      this.prisma.role.findMany({
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.permission.findMany({
        orderBy: [{ group: 'asc' }, { code: 'asc' }],
      }),
    ]);

    return {
      roles: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        permissions: role.permissions.map((item) => ({
          code: item.permission.code,
          name: item.permission.name,
          group: item.permission.group,
        })),
      })),
      permissions,
    };
  }
}
