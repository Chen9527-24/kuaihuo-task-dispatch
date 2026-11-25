import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnyPermissions } from '../../common/decorators/any-permissions.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMediaAccountDto, UpdateMediaAccountDto, UpdateMediaAccountStatusDto } from './dto/media-account.dto';
import { MediaAccountOptionsQueryDto, MediaAccountQueryDto } from './dto/media-account-query.dto';
import { MediaAccountsService } from './media-accounts.service';

@ApiTags('多媒体账号')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'media-accounts', version: '1' })
export class MediaAccountsController {
  constructor(private readonly service: MediaAccountsService) {}

  @Get()
  @Permissions('media-account:read')
  @ApiOperation({ summary: '多媒体账号列表' })
  list(@Query() query: MediaAccountQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(query, user);
  }

  @Get('options')
  @AnyPermissions('media-account:read', 'daily-task:create', 'daily-task:update')
  @ApiOperation({ summary: '多媒体账号下拉选项' })
  options(@Query() query: MediaAccountOptionsQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.options(query, user);
  }

  @Get(':id')
  @Permissions('media-account:read')
  @ApiOperation({ summary: '多媒体账号详情' })
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.detail(id, user);
  }

  @Post()
  @Permissions('media-account:create')
  @ApiOperation({ summary: '新增多媒体账号' })
  create(@Body() dto: CreateMediaAccountDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @Permissions('media-account:update')
  @ApiOperation({ summary: '编辑多媒体账号' })
  update(@Param('id') id: string, @Body() dto: UpdateMediaAccountDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  @Permissions('media-account:update')
  @ApiOperation({ summary: '更新多媒体账号状态' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateMediaAccountStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.updateStatus(id, dto.status, user);
  }

  @Delete(':id')
  @Permissions('media-account:delete')
  @ApiOperation({ summary: '删除多媒体账号（软删除）' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
