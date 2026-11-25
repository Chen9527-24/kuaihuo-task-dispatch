import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePermissionDto, UpdatePermissionDto, UpdatePermissionStatusDto } from './dto/permission.dto';
import { PermissionQueryDto } from './dto/permission-query.dto';
import { PermissionsService } from './permissions.service';

@ApiTags('权限管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'permissions', version: '1' })
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('tree')
  @Permissions('permission:read')
  @ApiOperation({ summary: '权限树' })
  tree(@Query('includeDisabled') includeDisabled?: string) {
    return this.permissionsService.tree(includeDisabled === 'true');
  }

  @Get()
  @Permissions('permission:read')
  @ApiOperation({ summary: '权限列表' })
  list(@Query() query: PermissionQueryDto) {
    return this.permissionsService.list(query);
  }

  @Get(':id')
  @Permissions('permission:read')
  @ApiOperation({ summary: '权限详情' })
  detail(@Param('id') id: string) {
    return this.permissionsService.detail(id);
  }

  @Post()
  @Permissions('permission:create')
  @ApiOperation({ summary: '新增权限' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Patch(':id')
  @Permissions('permission:update')
  @ApiOperation({ summary: '编辑权限' })
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  @Patch(':id/status')
  @Permissions('permission:update')
  @ApiOperation({ summary: '更新权限校验状态' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdatePermissionStatusDto) {
    return this.permissionsService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Permissions('permission:delete')
  @ApiOperation({ summary: '删除权限' })
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }
}
