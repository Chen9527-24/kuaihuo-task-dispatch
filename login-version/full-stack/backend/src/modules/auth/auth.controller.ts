import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { type SafeUser } from '../users/users.service';
import { CurrentUserPayload } from '../../common/types/current-user.type';

@ApiTags('认证鉴权')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: '账号密码登录', description: '使用用户名和密码换取 accessToken 与 refreshToken。' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: '登录成功' })
  @ApiUnauthorizedResponse({ description: '用户名或密码错误' })
  async login(@Body() _dto: LoginDto, @Req() request: Request) {
    return this.authService.login(request.user as SafeUser);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: '刷新登录令牌',
    description: '使用 refreshToken 换取新的 accessToken 与 refreshToken；可指定账号已绑定的目标租户。',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: '刷新成功' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken, dto.tenantId);
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: '退出登录', description: '使 refreshToken 对应的会话失效。' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ description: '退出成功' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: '获取当前登录用户', description: '返回当前 accessToken 对应的用户基础信息、角色和权限。' })
  @ApiOkResponse({ description: '获取成功' })
  async me(@CurrentUser() user: unknown) {
    return user;
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Post('switch-tenant')
  @ApiOperation({ summary: '切换当前租户', description: '仅允许切换当前账号已绑定且启用的租户，并返回新的登录结果。' })
  @ApiBody({ type: SwitchTenantDto })
  @ApiOkResponse({ description: '切换成功' })
  async switchTenant(@Body() dto: SwitchTenantDto, @CurrentUser() user: CurrentUserPayload) {
    return this.authService.switchTenant(user.id, dto.tenantId);
  }
}
