import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getPagination } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDictItemDto, UpdateDictItemDto } from './dto/dict-item.dto';
import { CreateDictTypeDto, UpdateDictTypeDto } from './dto/dict-type.dto';
import { DictItemQueryDto, DictOptionsQueryDto, DictTypeQueryDto } from './dto/dict-query.dto';

@Injectable()
export class DictsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTypes(query: DictTypeQueryDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.DictTypeWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { code: { contains: query.keyword, mode: 'insensitive' } },
              { name: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dictType.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.dictType.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async createType(dto: CreateDictTypeDto) {
    return this.prisma.dictType.create({ data: { ...dto, status: dto.status ?? 'ENABLED' } });
  }

  async updateType(id: string, dto: UpdateDictTypeDto) {
    await this.ensureType(id);
    return this.prisma.dictType.update({ where: { id }, data: dto });
  }

  async removeType(id: string) {
    await this.ensureType(id);
    await this.prisma.dictType.delete({ where: { id } });
    return { success: true };
  }

  async listItems(query: DictItemQueryDto) {
    const { skip, take, page, pageSize } = getPagination(query);
    const where: Prisma.DictItemWhereInput = {
      ...(query.typeCode ? { typeCode: query.typeCode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { label: { contains: query.keyword, mode: 'insensitive' } },
              { value: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dictItem.findMany({ where, skip, take, orderBy: [{ typeCode: 'asc' }, { sort: 'asc' }] }),
      this.prisma.dictItem.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async createItem(dto: CreateDictItemDto) {
    await this.ensureTypeByCode(dto.typeCode);
    return this.prisma.dictItem.create({
      data: { ...dto, status: dto.status ?? 'ENABLED', sort: dto.sort ?? 0 },
    });
  }

  async updateItem(id: string, dto: UpdateDictItemDto) {
    await this.ensureItem(id);
    return this.prisma.dictItem.update({ where: { id }, data: dto });
  }

  async removeItem(id: string) {
    await this.ensureItem(id);
    await this.prisma.dictItem.delete({ where: { id } });
    return { success: true };
  }

  /** 前端页面初始化下拉项批量获取接口。 */
  async options(query: DictOptionsQueryDto) {
    if (!query.types) {
      throw new BadRequestException('types is required, e.g. media_platform,enabled_status');
    }

    const typeCodes = [...new Set(query.types.split(',').map((item) => item.trim()).filter(Boolean))];
    const items = await this.prisma.dictItem.findMany({
      where: { typeCode: { in: typeCodes }, status: 'ENABLED' },
      orderBy: [{ typeCode: 'asc' }, { sort: 'asc' }],
    });

    return typeCodes.reduce<Record<string, Array<{ label: string; value: string; color: string | null; remark: string | null }>>>(
      (acc, typeCode) => {
        acc[typeCode] = items
          .filter((item) => item.typeCode === typeCode)
          .map((item) => ({ label: item.label, value: item.value, color: item.color, remark: item.remark }));
        return acc;
      },
      {},
    );
  }

  private async ensureType(id: string) {
    const item = await this.prisma.dictType.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Dict type not found');
    return item;
  }

  private async ensureTypeByCode(code: string) {
    const item = await this.prisma.dictType.findUnique({ where: { code } });
    if (!item) throw new NotFoundException('Dict type not found');
    return item;
  }

  private async ensureItem(id: string) {
    const item = await this.prisma.dictItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Dict item not found');
    return item;
  }
}
