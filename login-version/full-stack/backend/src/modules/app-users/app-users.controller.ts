import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppUsersService } from './app-users.service';
import { AppUserQueryDto } from './dto/app-user-query.dto';
import { BatchMarkAppUsersAsTestDataDto, MarkAppUserAsTestDataDto, ReleaseTaskAccountPhoneDto, RestrictAppUserDto, UpdateAppUserProfileDto, UpdateAppUserStatusDto, UpdateAppUserTaskAccountDto, UpdateAppUserTaskAccountStatusDto } from './dto/app-user.dto';

@ApiTags('H5成员')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app-users', version: '1' })
export class AppUsersController {
  constructor(private readonly service: AppUsersService) {}

  @Get()
  @Permissions('app-user:read')
  @ApiOperation({ summary: 'H5 成员列表（不含团长）' })
  list(@Query() query: AppUserQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }



  @Post('batch/mark-test-data')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '批量标记 H5 成员为独立测试账号', description: '用于测试清理范围处理清单的批量操作。只标记专用测试账号，不删除用户，不改变登录权限。' })
  batchMarkAsTestData(@Body() dto: BatchMarkAppUsersAsTestDataDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.batchMarkAsTestData(dto, user);
  }

  @Get('task-accounts/phone-occupancy')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '查询手机号的任务账号占用', description: '只检查指定手机号是否被 DistributionTaskAccount 占用；不会修改任何数据。' })
  getTaskAccountPhoneOccupancy(@Query('phone') phone: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getTaskAccountPhoneOccupancy(phone, user);
  }

  @Post('task-accounts/release-phone')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '释放指定手机号的任务账号占用', description: '只删除指定手机号对应的任务账号记录以释放唯一占用；不会批量释放其他手机号，也不会删除 H5 成员主体。' })
  releaseTaskAccountPhone(@Body() dto: ReleaseTaskAccountPhoneDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.releaseTaskAccountPhone(dto.phone, user);
  }

  @Get(':id')
  @Permissions('app-user:read')
  @ApiOperation({ summary: 'H5 成员详情（不含团长）' })
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detail(id, user);
  }

  @Patch(':id/status')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '启用/禁用 H5 成员' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAppUserStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateStatus(id, dto.status, user);
  }


  @Post(':id/mark-test-data')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '标记 H5 成员为独立测试账号', description: '仅用于独立测试账号。不会删除用户；后续已标记测试任务可按测试账号范围强制清理订单、佣金、提现与调账流水。' })
  markAsTestData(@Param('id') id: string, @Body() dto: MarkAppUserAsTestDataDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markAsTestData(id, dto, user);
  }

  @Patch(':id/profile')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '编辑 H5 成员资料' })
  updateProfile(@Param('id') id: string, @Body() dto: UpdateAppUserProfileDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateProfile(id, dto, user);
  }

  @Post(':id/abandon-count/reset')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '重置 H5 成员今日放弃次数' })
  resetAbandonCount(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resetTodayAbandonCount(id, user);
  }

  @Patch(':id/task-accounts/:accountId')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '编辑 H5 成员名下任务账号资料' })
  updateTaskAccount(
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAppUserTaskAccountDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateTaskAccount(id, accountId, dto, user);
  }

  @Patch(':id/task-accounts/:accountId/status')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '启用/停用 H5 成员名下任务账号' })
  updateTaskAccountStatus(
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateAppUserTaskAccountStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateTaskAccountStatus(id, accountId, dto.status, user);
  }

  @Delete(':id/task-accounts/:accountId')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '删除 H5 成员名下任务账号' })
  removeTaskAccount(@Param('id') id: string, @Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeTaskAccount(id, accountId, user);
  }

  @Post(':id/task-accounts/:accountId/default')
  @Permissions('app-user:update')
  @ApiOperation({ summary: '设置 H5 成员默认任务账号' })
  setDefaultTaskAccount(@Param('id') id: string, @Param('accountId') accountId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.setDefaultTaskAccount(id, accountId, user);
  }

  @Post(':id/restrictions')
  @Permissions('app-user:restrict')
  @ApiOperation({ summary: '限制 H5 成员接单' })
  restrict(@Param('id') id: string, @Body() dto: RestrictAppUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.restrict(id, dto, user);
  }

  @Delete(':id')
  @Permissions('app-user:delete')
  @ApiOperation({ summary: '删除 H5 成员（软删除）' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
