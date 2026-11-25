import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { WechatUrlDto, WxMiniLoginDto, WxMiniPhoneDto, WxMiniProfileDto, WxacodeDto } from './dto/wechat.dto';
import { WechatService } from './wechat.service';

@ApiTags('小程序-版本模式')
@Public()
@Controller({ path: 'app/miniprogram', version: '1' })
export class MiniProgramModeController {
  constructor(private readonly wechatService: WechatService) {}

  @Get('mode')
  @ApiOperation({ summary: '获取当前小程序版本模式', description: '返回 audit/release，用于小程序决定进入审核版静态模块或正式版。' })
  @ApiOkResponse({ description: '获取成功' })
  getMode(@Query('version') version?: string) {
    return this.wechatService.getMiniProgramMode(version);
  }
}

@ApiTags('小程序-微信授权')
@Public()
@Controller({ path: 'wx-mini', version: '1' })
export class WxMiniController {
  constructor(private readonly wechatService: WechatService) {}

  @Post('login')
  @ApiOperation({ summary: 'wx.login code 换取 openid/token' })
  login(@Body() dto: WxMiniLoginDto) {
    return this.wechatService.exchangeLogin(dto.code);
  }

  @Post('phone')
  @ApiOperation({ summary: 'getPhoneNumber code 换取手机号' })
  phone(@Body() dto: WxMiniPhoneDto, @Headers('authorization') authorization?: string) {
    return this.wechatService.exchangePhone(dto.code, authorization);
  }

  @Get('profile')
  @ApiOperation({ summary: '获取当前小程序用户资料缓存' })
  profile(@Headers('authorization') authorization?: string) {
    return this.wechatService.getProfile(authorization);
  }

  @Post('profile')
  @ApiOperation({ summary: '保存当前小程序用户资料缓存' })
  saveProfile(@Body() dto: WxMiniProfileDto, @Headers('authorization') authorization?: string) {
    return this.wechatService.saveProfile(dto, authorization);
  }
}

@ApiTags('小程序-微信开放能力')
@Public()
@Controller({ path: 'wechat', version: '1' })
export class WechatOpenController {
  constructor(private readonly wechatService: WechatService) {}

  @Post('wxacode')
  @ApiOperation({ summary: '生成带参数微信小程序码', description: 'PC 后台可传 tenantId/tenantsId + postId，后端生成 scene 并落盘返回图片地址。' })
  wxacode(@Body() dto: WxacodeDto) {
    return this.wechatService.createWxacode(dto);
  }

  @Post('url-link')
  @ApiOperation({ summary: '生成 URL Link' })
  urlLink(@Body() dto: WechatUrlDto) {
    return this.wechatService.createUrlLink(dto);
  }

  @Post('url-scheme')
  @ApiOperation({ summary: '生成 URL Scheme' })
  urlScheme(@Body() dto: WechatUrlDto) {
    return this.wechatService.createUrlScheme(dto);
  }

  @Get('js-sdk-signature')
  @ApiOperation({ summary: '生成公众号 JS-SDK 签名' })
  jsSdkSignature(@Query('url') url: string) {
    return this.wechatService.createOfficialAccountJsSdkSignature(url);
  }

  @Get('scene/:ticket')
  @ApiOperation({ summary: '解析小程序码 scene ticket' })
  scene(@Param('ticket') ticket: string) {
    return this.wechatService.resolveScene(ticket);
  }

  @Get('oauth/authorize')
  @ApiOperation({ summary: '服务号网页授权入口', description: 'H5 微信内未登录时跳转到本接口，由后端生成微信 OAuth 授权地址并 302 到微信。' })
  async officialAccountOAuthAuthorize(
    @Query('redirect') redirect: string | undefined,
    @Query('returnOrigin') returnOrigin: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const url = await this.wechatService.createOfficialAccountOAuthAuthorizeUrl(redirect, request, returnOrigin);
    return response.redirect(url);
  }

  @Get('oauth/callback')
  @ApiOperation({ summary: '服务号网页授权回调', description: '微信携带 code/state 回调后端，后端换取 openid、创建/登录 H5 成员并 302 回 H5。' })
  async officialAccountOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const url = await this.wechatService.handleOfficialAccountOAuthCallback(code, state, request);
    return response.redirect(url);
  }
}

@ApiTags('小程序-平台操作指引')
@Public()
@Controller({ path: 'platform-guide', version: '1' })
export class PlatformGuideController {
  constructor(private readonly wechatService: WechatService) {}

  @Get('public')
  @ApiOperation({ summary: '获取公开平台操作指引兜底配置' })
  publicGuide(@Query('platform') platform?: string) {
    return this.wechatService.getPlatformGuide(platform);
  }
}
