import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RbacService } from './rbac.service';

@ApiTags('权限管理')
@ApiBearerAuth('BearerAuth')
@Roles('admin')
@Controller({ path: 'rbac', version: '1' })
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('overview')
  @Permissions('rbac:read')
  @ApiOperation({ summary: '查看权限概览', description: '返回系统内的角色、权限及基础 RBAC 结构。' })
  @ApiOkResponse({ description: '获取成功' })
  async overview() {
    return this.rbacService.getOverview();
  }

  @Get('me/access')
  @ApiOperation({ summary: '查看我的访问权限', description: '返回当前用户拥有的角色和权限集合。' })
  @ApiOkResponse({ description: '获取成功' })
  async myAccess(@CurrentUser() user: unknown) {
    return user;
  }
}
