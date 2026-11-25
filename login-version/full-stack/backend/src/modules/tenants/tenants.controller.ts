import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTenantDto, UpdateTenantDto, UpdateTenantStatusDto } from './dto/tenant.dto';
import { TenantQueryDto } from './dto/tenant-query.dto';
import { TenantsService } from './tenants.service';

@ApiTags('租户管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'tenants', version: '1' })
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Permissions('tenant:read')
  @ApiOperation({ summary: '租户列表' })
  list(@Query() query: TenantQueryDto) {
    return this.tenantsService.list(query);
  }

  @Get('options')
  @ApiOperation({ summary: '租户下拉选项' })
  options(@CurrentUser() user: CurrentUserPayload) {
    return this.tenantsService.options(user);
  }

  @Get(':id')
  @Permissions('tenant:read')
  @ApiOperation({ summary: '租户详情' })
  detail(@Param('id') id: string) {
    return this.tenantsService.detail(id);
  }

  @Post()
  @Permissions('tenant:create')
  @ApiOperation({ summary: '新增租户' })
  @ApiOkResponse({ description: '创建成功' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Patch(':id')
  @Permissions('tenant:update')
  @ApiOperation({ summary: '编辑租户' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/status')
  @Permissions('tenant:update')
  @ApiOperation({ summary: '更新租户状态' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenantsService.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @Permissions('tenant:delete')
  @ApiOperation({ summary: '删除租户（软删除）' })
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }
}
