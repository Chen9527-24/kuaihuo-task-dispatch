import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUserPayload } from '../../common/types/current-user.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto, UpdateUserStatusDto } from './dto/user-admin.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersService } from './users.service';

@ApiTags('账号管理')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @Permissions('user:profile:read')
  @ApiOperation({ summary: '获取我的资料', description: '读取当前登录用户的个人资料、角色和权限。' })
  @ApiOkResponse({ description: '获取成功' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findSafeUserById(userId);
  }

  @Patch('me')
  @Permissions('user:profile:update')
  @ApiOperation({ summary: '更新我的资料', description: '更新当前登录用户的昵称、手机号等信息。' })
  @ApiOkResponse({ description: '更新成功' })
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post('me/avatar')
  @Permissions('user:profile:update')
  @ApiOperation({ summary: '上传我的头像', description: '业务上传接口：上传文件后立即绑定当前用户头像。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  updateMyAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true })) file: Express.Multer.File,
  ) {
    return this.usersService.updateAvatar(userId, file);
  }

  @Get()
  @Permissions('user:read')
  @ApiOperation({ summary: '账号列表' })
  list(@Query() query: UserQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.list(query, user);
  }

  @Post()
  @Permissions('user:create')
  @ApiOperation({ summary: '新增账号' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.create(dto, user);
  }

  @Get(':id')
  @Permissions('user:read')
  @ApiOperation({ summary: '账号详情' })
  detail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.detail(id, user);
  }

  @Patch(':id')
  @Permissions('user:update')
  @ApiOperation({ summary: '编辑账号' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Permissions('user:update')
  @ApiOperation({ summary: '更新账号状态' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.updateStatus(id, dto.status, user);
  }

  @Post(':id/reset-password')
  @Permissions('user:update')
  @ApiOperation({ summary: '重置账号密码' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.resetPassword(id, dto, user);
  }

  @Post(':id/avatar')
  @Permissions('user:update')
  @ApiOperation({ summary: '上传指定账号头像', description: '已有账号头像上传，上传后立即绑定。' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } }, required: ['file'] } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  updateUserAvatar(
    @Param('id') id: string,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true })) file: Express.Multer.File,
  ) {
    return this.usersService.updateAvatar(id, file);
  }

  @Delete(':id')
  @Permissions('user:delete')
  @ApiOperation({ summary: '删除账号（软删除）' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.remove(id, user);
  }
}
