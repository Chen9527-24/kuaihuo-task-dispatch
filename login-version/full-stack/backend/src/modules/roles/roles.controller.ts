import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnyPermissions } from '../../common/decorators/any-permissions.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRoleDto, UpdateRoleDto, UpdateRoleStatusDto } from './dto/role.dto';
import { RoleQueryDto } from './dto/role-query.dto';
import { RolesService } from './roles.service';

@ApiTags('角色管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('role:read')
  @ApiOperation({ summary: '角色列表' })
  list(@Query() query: RoleQueryDto) {
    return this.rolesService.list(query);
  }

  @Get('options')
  @AnyPermissions('role:read', 'user:create', 'user:update')
  @ApiOperation({ summary: '角色下拉选项' })
  options(@CurrentUser() user: CurrentUserPayload) {
    return this.rolesService.options(user);
  }

  @Get(':id')
  @Permissions('role:read')
  @ApiOperation({ summary: '角色详情' })
  detail(@Param('id') id: string) {
    return this.rolesService.detail(id);
  }

  @Post()
  @Permissions('role:create')
  @ApiOperation({ summary: '新增角色' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @Permissions('role:update')
  @ApiOperation({ summary: '编辑角色并绑定权限' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Patch(':id/status')
  @Permissions('role:update')
  @ApiOperation({ summary: '更新角色状态' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateRoleStatusDto) {
    return this.rolesService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Permissions('role:delete')
  @ApiOperation({ summary: '删除角色' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
