import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WechatUrlDto, WxMiniProfileDto, WxacodeDto } from './dto/wechat.dto';

type WxEnvVersion = 'develop' | 'trial' | 'release';

type WechatJson = Record<string, any>;

@Injectable()
export class WechatService {
  private accessTokenLoading?: Promise<string>;
  private officialAccountTokenLoading?: Promise<string>;
  private officialAccountJsapiTicketLoading?: Promise<string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  getMiniProgramMode(version?: string) {
    const currentVersion = String(version ?? '').trim();
    const forcedMode = String(process.env.MINI_PROGRAM_FORCE_MODE ?? '').trim().toLowerCase();
    const auditVersion = String(process.env.MINI_PROGRAM_AUDIT_VERSION ?? '').trim();
    const auditVersions = String(process.env.MINI_PROGRAM_AUDIT_VERSIONS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const auditEnabled = ['1', 'true', 'yes', 'on'].includes(
      String(process.env.MINI_PROGRAM_AUDIT_ENABLED ?? '').trim().toLowerCase(),
    );

    const isAudit = forcedMode === 'audit'
      || auditEnabled
      || (!!currentVersion && currentVersion === auditVersion)
      || (!!currentVersion && auditVersions.includes(currentVersion));

    return {
      mode: isAudit ? 'audit' : 'release',
      isAudit,
      isInAudit: isAudit,
      isLiteMode: isAudit,
      auditVersion,
      auditVersions,
      modeVersion: currentVersion || auditVersion || '',
      currentVersion,
    };
  }

  async exchangeLogin(code: string) {
    const appid = this.requireMiniAppId();
    const secret = this.requireMiniSecret();
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    const payload = await this.fetchWechatJson(url.toString());
    this.assertWechatOk(payload, '微信登录凭证换取失败');

    const token = this.createToken(payload.openid, payload.session_key);
    await this.redisService.set(
      `wechat:mini:session:${token}`,
      JSON.stringify({ ...payload, token, createdAt: new Date().toISOString() }),
      7 * 24 * 60 * 60,
    );

    return {
      token,
      sessionToken: token,
      openid: payload.openid,
      openId: payload.openid,
      unionid: payload.unionid,
      expiresIn: 7 * 24 * 60 * 60,
    };
  }

  async exchangePhone(code: string, authorization?: string) {
    const accessToken = await this.getAccessToken();
    const payload = await this.fetchWechatJson(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      },
    );
    this.assertWechatOk(payload, '微信手机号换取失败');
    const info = payload.phone_info ?? {};
    const token = this.readBearerToken(authorization);
    if (token) {
      const rawSession = await this.redisService.get(`wechat:mini:session:${token}`);
      if (rawSession) {
        await this.redisService.set(
          `wechat:mini:session:${token}`,
          JSON.stringify({ ...JSON.parse(rawSession), phoneInfo: info, updatedAt: new Date().toISOString() }),
          7 * 24 * 60 * 60,
        );
      }
    }
    return {
      phoneNumber: info.phoneNumber,
      purePhoneNumber: info.purePhoneNumber,
      countryCode: info.countryCode,
      watermark: info.watermark,
    };
  }

  async getProfile(authorization?: string) {
    const token = this.readBearerToken(authorization);
    if (!token) return {};
    const raw = await this.redisService.get(`wechat:mini:profile:${token}`);
    return raw ? JSON.parse(raw) : {};
  }

  async saveProfile(dto: WxMiniProfileDto, authorization?: string) {
    const token = this.readBearerToken(authorization);
    if (!token) {
      throw new BadRequestException('缺少登录 token，请先调用 /api/v1/wx-mini/login');
    }
    const profile = {
      nickname: String(dto.nickname ?? '').trim(),
      avatarUrl: String(dto.avatarUrl ?? '').trim(),
      updatedAt: new Date().toISOString(),
    };
    await this.redisService.set(`wechat:mini:profile:${token}`, JSON.stringify(profile), 7 * 24 * 60 * 60);
    return profile;
  }

  async createWxacode(dto: WxacodeDto) {
    const accessToken = await this.getAccessToken();
    const page = String(dto.page || process.env.WECHAT_MINI_CODE_PAGE || 'pages/Home').replace(/^\//, '');
    const envVersion = this.resolveEnvVersion(dto.envVersion);
    const sceneInfo = await this.buildScene(dto);
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: sceneInfo.scene,
          page,
          check_path: dto.checkPath ?? false,
          env_version: envVersion,
        }),
      },
    );

    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (contentType.includes('application/json')) {
      const text = buffer.toString('utf8');
      const payload = this.safeJson(text);
      this.assertWechatOk(payload, '微信小程序码生成失败');
      throw new InternalServerErrorException('微信小程序码生成失败：未返回图片内容');
    }
    if (!response.ok || buffer.length === 0) {
      throw new InternalServerErrorException(`微信小程序码生成失败：HTTP ${response.status}`);
    }

    const file = await this.saveWxacodeImage(buffer, sceneInfo.ticket);
    return {
      ...sceneInfo,
      page,
      envVersion,
      url: file.url,
      fullUrl: file.fullUrl,
    };
  }

  async createUrlLink(dto: WechatUrlDto) {
    const accessToken = await this.getAccessToken();
    const payload = await this.fetchWechatJson(
      `https://api.weixin.qq.com/wxa/generate_urllink?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: dto.path || process.env.WECHAT_MINI_CODE_PAGE || 'pages/Home',
          query: dto.query || '',
          env_version: this.resolveEnvVersion(dto.envVersion),
          expire_type: dto.expireType ?? 1,
          expire_interval: dto.expireInterval ?? 30,
          cloud_base: dto.cloudBase,
        }),
      },
    );
    this.assertWechatOk(payload, '微信 URL Link 生成失败');
    return payload;
  }

  async createUrlScheme(dto: WechatUrlDto) {
    const accessToken = await this.getAccessToken();
    const payload = await this.fetchWechatJson(
      `https://api.weixin.qq.com/wxa/generatescheme?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jump_wxa: {
            path: dto.path || process.env.WECHAT_MINI_CODE_PAGE || 'pages/Home',
            query: dto.query || '',
            env_version: this.resolveEnvVersion(dto.envVersion),
          },
          expire_type: dto.expireType ?? 1,
          expire_interval: dto.expireInterval ?? 30,
        }),
      },
    );
    this.assertWechatOk(payload, '微信 URL Scheme 生成失败');
    return payload;
  }


  async createOfficialAccountOAuthAuthorizeUrl(redirect?: string, request?: Request, returnOrigin?: string) {
    const appid = this.requireOfficialAccountAppId();
    const callbackUrl = this.resolveOfficialAccountOAuthCallbackUrl();
    const scope = this.resolveOfficialAccountOAuthScope();
    const state = randomBytes(16).toString('hex');
    const normalizedRedirect = this.normalizeH5RedirectPath(redirect);
    const allowedReturnOrigin = this.resolveAllowedOAuthReturnOrigin(returnOrigin);
    const tenantId = await this.resolveOfficialAccountTenantIdFromRedirect(normalizedRedirect);
    await this.redisService.set(
      `wechat:mp:oauth:state:${state}`,
      JSON.stringify({
        redirect: normalizedRedirect,
        returnOrigin: allowedReturnOrigin,
        tenantId,
        ip: this.normalizeRequestIp(request),
        userAgent: this.normalizeRequestUserAgent(request),
        createdAt: new Date().toISOString(),
      }),
      10 * 60,
    );

    const url = new URL('https://open.weixin.qq.com/connect/oauth2/authorize');
    url.searchParams.set('appid', appid);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scope);
    url.searchParams.set('state', state);
    return `${url.toString()}#wechat_redirect`;
  }

  async handleOfficialAccountOAuthCallback(code?: string, state?: string, request?: Request) {
    const cleanCode = String(code || '').trim();
    const cleanState = String(state || '').trim();
    if (!cleanCode) {
      return this.buildH5WechatCallbackUrl({ error: 'missing_code', message: '缺少微信授权 code', redirect: '/' });
    }
    const statePayload = await this.consumeOfficialAccountOAuthState(cleanState);
    if (!statePayload) {
      return this.buildH5WechatCallbackUrl({ error: 'invalid_state', message: '微信授权状态已过期，请重新进入页面', redirect: '/' });
    }

    const wxPayload = await this.exchangeOfficialAccountOAuthCode(cleanCode);
    const openid = String(wxPayload.openid || '').trim();
    if (!openid) {
      throw new BadRequestException('微信网页授权失败：未返回 openid');
    }

    const appUser = await this.upsertDistributionAppUserByOfficialAccount({
      openid,
      unionid: String(wxPayload.unionid || '').trim() || null,
      tenantId: statePayload.tenantId || null,
    });
    const token = this.createToken(openid, appUser.id);
    const now = new Date();
    const expiresIn = 7 * 24 * 60 * 60;
    const subscribed = await this.getOfficialAccountSubscribeStatus(openid).catch(() => null);
    await this.redisService.set(
      `distribution:session:${token}`,
      JSON.stringify({
        appUserId: appUser.id,
        phone: appUser.phone,
        serviceOpenid: appUser.serviceOpenid,
        unionid: appUser.unionid,
        wechatSubscribed: subscribed,
        tenantId: statePayload.tenantId || null,
        ip: this.normalizeRequestIp(request),
        userAgent: this.normalizeRequestUserAgent(request),
        loginType: 'WECHAT_MP_OAUTH',
        createdAt: now.toISOString(),
      }),
      expiresIn,
    );

    return this.buildH5WechatCallbackUrl({
      token,
      appToken: token,
      expiresIn,
      redirect: statePayload.redirect,
      returnOrigin: statePayload.returnOrigin,
    });
  }


  async sendOfficialAccountTemplateMessage(params: {
    openid: string;
    templateId: string;
    url?: string;
    data: Record<string, { value: string; color?: string }>;
  }) {
    const openid = String(params.openid || '').trim();
    const templateId = String(params.templateId || '').trim();
    if (!openid || !templateId) {
      return { skipped: true, reason: 'missing openid or templateId' };
    }
    const accessToken = await this.getOfficialAccountAccessToken();
    const payload = await this.fetchWechatJson(
      `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: openid,
          template_id: templateId,
          url: params.url || undefined,
          data: params.data,
        }),
      },
    );
    this.assertWechatOk(payload, '公众号模板消息发送失败');
    return payload;
  }

  async getOfficialAccountSubscribeStatus(openid?: string | null, forceRefresh = false) {
    const cleanOpenid = String(openid || '').trim();
    if (!cleanOpenid) return null;
    const cacheKey = `wechat:mp:subscribe:${cleanOpenid}`;
    if (!forceRefresh) {
      const cached = await this.redisService.get(cacheKey);
      if (cached === '1') return true;
      if (cached === '0') return false;
    }

    const accessToken = await this.getOfficialAccountAccessToken();
    const url = new URL('https://api.weixin.qq.com/cgi-bin/user/info');
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('openid', cleanOpenid);
    url.searchParams.set('lang', 'zh_CN');
    const payload = await this.fetchWechatJson(url.toString());
    this.assertWechatOk(payload, '公众号关注状态获取失败');
    const subscribed = Number(payload.subscribe || 0) === 1;
    await this.redisService.set(cacheKey, subscribed ? '1' : '0', 60);
    return subscribed;
  }

  async createOfficialAccountJsSdkSignature(pageUrl?: string | null) {
    const cleanUrl = String(pageUrl || '').trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
      throw new BadRequestException('缺少有效的页面 URL');
    }
    const appId = this.requireOfficialAccountAppId();
    const jsapiTicket = await this.getOfficialAccountJsapiTicket();
    const nonceStr = randomBytes(8).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const source = [
      `jsapi_ticket=${jsapiTicket}`,
      `noncestr=${nonceStr}`,
      `timestamp=${timestamp}`,
      `url=${cleanUrl}`,
    ].join('&');
    const signature = createHash('sha1').update(source).digest('hex');
    return { appId, nonceStr, timestamp, signature };
  }

  async resolveScene(ticket: string) {
    const raw = await this.redisService.get(`wechat:mini:scene:${ticket}`);
    if (!raw) {
      throw new NotFoundException('小程序码参数不存在或已过期');
    }
    return JSON.parse(raw);
  }

  async getPlatformGuide(platform?: string) {
    const key = String(platform || '').trim().toLowerCase();
    const base = [
      { step: 1, stepKey: 'step1', title: '打开任务', sortOrder: 1, status: 1 },
      { step: 2, stepKey: 'step2', title: '领取评论', sortOrder: 2, status: 1 },
      { step: 3, stepKey: 'step3', title: '提交凭证', sortOrder: 3, status: 1 },
    ];
    const textMap: Record<string, string[]> = {
      douyin: ['复制链接后打开抖音。', '按页面指引完成评论。', '上传完成截图后提交。'],
      xiaohongshu: ['复制链接后打开小红书。', '按页面指引完成评论。', '上传完成截图后提交。'],
      weixin: ['打开微信视频号/文章。', '领取评论内容并完成互动。', '上传完成截图后提交。'],
    };
    const tips = textMap[key] || ['按页面指引操作。', '完成互动任务。', '上传完成截图后提交。'];
    return base.map((item, index) => ({
      ...item,
      platform: key || 'default',
      steps: {
        step: item.step,
        stepKey: item.stepKey,
        tips: [tips[index]],
        buttons: [],
      },
    }));
  }

  private async getAccessToken() {
    const cached = await this.redisService.get('wechat:mini:access_token');
    if (cached) return cached;
    if (this.accessTokenLoading) return this.accessTokenLoading;

    this.accessTokenLoading = (async () => {
      const appid = this.requireMiniAppId();
      const secret = this.requireMiniSecret();
      const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
      url.searchParams.set('grant_type', 'client_credential');
      url.searchParams.set('appid', appid);
      url.searchParams.set('secret', secret);
      const payload = await this.fetchWechatJson(url.toString());
      this.assertWechatOk(payload, '微信 access_token 获取失败');
      const token = String(payload.access_token || '').trim();
      if (!token) throw new InternalServerErrorException('微信 access_token 获取失败：返回为空');
      const ttl = Math.max(60, Number(payload.expires_in || 7200) - 300);
      await this.redisService.set('wechat:mini:access_token', token, ttl);
      return token;
    })();

    try {
      return await this.accessTokenLoading;
    } finally {
      this.accessTokenLoading = undefined;
    }
  }


  private async getOfficialAccountAccessToken() {
    const cached = await this.redisService.get('wechat:mp:access_token');
    if (cached) return cached;
    if (this.officialAccountTokenLoading) return this.officialAccountTokenLoading;

    this.officialAccountTokenLoading = (async () => {
      const appid = this.requireOfficialAccountAppId();
      const secret = this.requireOfficialAccountSecret();
      const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
      url.searchParams.set('grant_type', 'client_credential');
      url.searchParams.set('appid', appid);
      url.searchParams.set('secret', secret);
      const payload = await this.fetchWechatJson(url.toString());
      this.assertWechatOk(payload, '微信公众号 access_token 获取失败');
      const token = String(payload.access_token || '').trim();
      if (!token) throw new InternalServerErrorException('微信公众号 access_token 获取失败：返回为空');
      const ttl = Math.max(60, Number(payload.expires_in || 7200) - 300);
      await this.redisService.set('wechat:mp:access_token', token, ttl);
      return token;
    })();

    try {
      return await this.officialAccountTokenLoading;
    } finally {
      this.officialAccountTokenLoading = undefined;
    }
  }

  private async getOfficialAccountJsapiTicket() {
    const cached = await this.redisService.get('wechat:mp:jsapi_ticket');
    if (cached) return cached;
    if (this.officialAccountJsapiTicketLoading) return this.officialAccountJsapiTicketLoading;

    this.officialAccountJsapiTicketLoading = (async () => {
      const accessToken = await this.getOfficialAccountAccessToken();
      const url = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket');
      url.searchParams.set('access_token', accessToken);
      url.searchParams.set('type', 'jsapi');
      const payload = await this.fetchWechatJson(url.toString());
      this.assertWechatOk(payload, '微信公众号 jsapi_ticket 获取失败');
      const ticket = String(payload.ticket || '').trim();
      if (!ticket) throw new InternalServerErrorException('微信公众号 jsapi_ticket 获取失败：返回为空');
      const ttl = Math.max(60, Number(payload.expires_in || 7200) - 300);
      await this.redisService.set('wechat:mp:jsapi_ticket', ticket, ttl);
      return ticket;
    })();

    try {
      return await this.officialAccountJsapiTicketLoading;
    } finally {
      this.officialAccountJsapiTicketLoading = undefined;
    }
  }

  private async buildScene(dto: WxacodeDto) {
    const directScene = String(dto.scene || '').trim();
    const payload = {
      tenantsId: String(dto.tenantsId || dto.tenantId || '').trim(),
      tenantId: String(dto.tenantId || dto.tenantsId || '').trim(),
      postId: String(dto.postId || '').trim(),
      type: 'post',
    };
    if (directScene) {
      return { scene: directScene, ticket: this.hashText(directScene).slice(0, 24), payload: { scene: directScene } };
    }
    if (!payload.tenantsId || !payload.postId) {
      throw new BadRequestException('生成带参小程序码时必须提供 tenantId/tenantsId 和 postId，或直接提供 scene。');
    }
    const ticket = randomBytes(12).toString('hex');
    const ttl = Number(process.env.WECHAT_SCENE_TTL_SECONDS || 30 * 24 * 60 * 60);
    await this.redisService.set(`wechat:mini:scene:${ticket}`, JSON.stringify(payload), ttl);
    return { scene: `s=${ticket}`, ticket, payload };
  }

  private async saveWxacodeImage(buffer: Buffer, ticket: string) {
    const uploadDir = this.configService.get<string>('storage.localUploadDir', 'uploads');
    const subDir = 'wechat-codes';
    const filename = `${ticket || randomBytes(6).toString('hex')}.png`;
    const fullDir = join(process.cwd(), uploadDir, subDir);
    await fs.mkdir(fullDir, { recursive: true });
    await fs.writeFile(join(fullDir, filename), buffer);
    const relativeUrl = `/${uploadDir}/${subDir}/${filename}`.replace(/\/+/g, '/');
    const baseUrl = String(this.configService.get<string>('app.baseUrl', '') || '').replace(/\/+$/, '');
    return {
      url: relativeUrl,
      fullUrl: baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl,
      ext: extname(filename),
    };
  }


  private async exchangeOfficialAccountOAuthCode(code: string) {
    const appid = this.requireOfficialAccountAppId();
    const secret = this.requireOfficialAccountSecret();
    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    url.searchParams.set('code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const payload = await this.fetchWechatJson(url.toString());
    this.assertWechatOk(payload, '微信网页授权 code 换取 openid 失败');
    return payload;
  }

  private async upsertDistributionAppUserByOfficialAccount(params: { openid: string; unionid?: string | null; tenantId?: string | null }) {
    const now = new Date();
    const nickname = `微信用户${params.openid.slice(-6)}`;
    const existing = await this.prisma.appUser.findUnique({ where: { serviceOpenid: params.openid } });
    if (existing?.deletedAt) {
      await this.prisma.appUser.update({
        where: { id: existing.id },
        data: {
          phone: null,
          serviceOpenid: null,
          wechatOpenid: null,
          unionid: null,
          status: 'DISABLED',
        },
      });
    } else if (existing) {
      if (existing.status === 'DISABLED' || (params.tenantId && existing.tenantId && params.tenantId !== existing.tenantId)) {
        throw new BadRequestException('此账号在当前站点不可用');
      }
      return this.prisma.appUser.update({
        where: { id: existing.id },
        data: {
          serviceOpenid: params.openid,
          unionid: params.unionid || existing.unionid || undefined,
          ...(params.tenantId ? { tenantId: params.tenantId } : {}),
          nickname: existing.nickname || nickname,
          deletedAt: null,
          status: existing.deletedAt ? 'ENABLED' : existing.status,
          lastLoginAt: now,
        },
      });
    }

    const unionUser = params.unionid
      ? await this.prisma.appUser.findFirst({ where: { unionid: params.unionid, deletedAt: null } })
      : null;
    if (unionUser) {
      if (unionUser.status === 'DISABLED' || (params.tenantId && unionUser.tenantId && params.tenantId !== unionUser.tenantId)) {
        throw new BadRequestException('此账号在当前站点不可用');
      }
      return this.prisma.appUser.update({
        where: { id: unionUser.id },
        data: {
          serviceOpenid: params.openid,
          ...(params.tenantId ? { tenantId: params.tenantId } : {}),
          nickname: unionUser.nickname || nickname,
          lastLoginAt: now,
        },
      });
    }

    return this.prisma.appUser.create({
      data: {
        phone: null,
        tenantId: params.tenantId || null,
        nickname,
        serviceOpenid: params.openid,
        unionid: params.unionid || null,
        status: 'ENABLED',
        lastLoginAt: now,
      },
    });
  }

  private async consumeOfficialAccountOAuthState(state: string) {
    if (!state) return null;
    const key = `wechat:mp:oauth:state:${state}`;
    const raw = await this.redisService.get(key);
    await this.redisService.del(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { redirect?: string; returnOrigin?: string | null; tenantId?: string | null };
      return {
        redirect: this.normalizeH5RedirectPath(parsed.redirect),
        returnOrigin: this.resolveAllowedOAuthReturnOrigin(parsed.returnOrigin),
        tenantId: parsed.tenantId || null,
      };
    } catch {
      return { redirect: '/', returnOrigin: null, tenantId: null };
    }
  }

  private async resolveOfficialAccountTenantIdFromRedirect(redirect?: string | null) {
    const normalized = this.normalizeH5RedirectPath(redirect);
    let tenantRef = '';
    try {
      const url = new URL(normalized, this.resolveH5BaseUrl());
      tenantRef = String(url.searchParams.get('tenantId') || url.searchParams.get('tenantsId') || '').trim();
    } catch {
      tenantRef = '';
    }
    if (!tenantRef || tenantRef === '0' || tenantRef === 'null' || tenantRef === 'undefined') return null;
    const tenant = await this.prisma.tenant.findFirst({
      where: { deletedAt: null, OR: [{ id: tenantRef }, { code: tenantRef }] },
      select: { id: true },
    });
    return tenant?.id ?? null;
  }

  private resolveOfficialAccountOAuthCallbackUrl() {
    const configuredPath = String(process.env.WECHAT_MP_OAUTH_CALLBACK_PATH || '/api/v1/wechat/oauth/callback').trim();
    if (/^https?:\/\//i.test(configuredPath)) {
      return configuredPath;
    }
    const apiBase = String(process.env.API_BASE_URL || '').trim();
    const appBase = String(this.configService.get<string>('app.baseUrl', '') || '').trim();
    const base = apiBase || appBase;
    if (!base) {
      throw new BadRequestException('缺少 API_BASE_URL 或 APP_BASE_URL，无法生成微信网页授权回调地址。');
    }
    const baseUrl = new URL(base);
    const origin = `${baseUrl.protocol}//${baseUrl.host}`;
    if (configuredPath.startsWith('/api/')) {
      return new URL(configuredPath, origin).toString();
    }
    const normalizedBase = base.replace(/\/+$/, '') + '/';
    return new URL(configuredPath.replace(/^\/+/, ''), normalizedBase).toString();
  }

  private resolveOfficialAccountOAuthScope() {
    const scope = String(process.env.WECHAT_MP_OAUTH_SCOPE || 'snsapi_base').trim();
    return scope === 'snsapi_userinfo' ? 'snsapi_userinfo' : 'snsapi_base';
  }

  private resolveH5BaseUrl() {
    const h5Base = String(process.env.H5_BASE_URL || '').trim();
    if (h5Base) return h5Base;
    const origin = this.configService.get<string | string[]>('app.origin', 'http://localhost:5173');
    if (Array.isArray(origin)) return String(origin[0] || 'http://localhost:5173').trim();
    return String(origin || 'http://localhost:5173').split(',')[0].trim();
  }

  private resolveH5CallbackBaseUrl(returnOrigin?: string | null) {
    const allowedReturnOrigin = this.resolveAllowedOAuthReturnOrigin(returnOrigin);
    return allowedReturnOrigin || this.resolveH5BaseUrl();
  }

  private resolveAllowedOAuthReturnOrigin(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    let origin = '';
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      origin = url.origin;
    } catch {
      return null;
    }

    if (!this.isOAuthReturnOriginAllowed(origin)) {
      throw new BadRequestException('当前 H5 回跳来源未被允许，请检查 WECHAT_MP_OAUTH_ALLOWED_RETURN_ORIGINS。');
    }
    return origin;
  }

  private isOAuthReturnOriginAllowed(origin: string) {
    const target = new URL(origin);
    const h5Origin = new URL(this.resolveH5BaseUrl()).origin;
    if (target.origin === h5Origin) return true;

    const entries = String(process.env.WECHAT_MP_OAUTH_ALLOWED_RETURN_ORIGINS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return entries.some((entry) => this.matchOAuthReturnOriginEntry(target, entry));
  }

  private matchOAuthReturnOriginEntry(target: URL, entry: string) {
    try {
      if (entry.endsWith(':*')) {
        const base = new URL(entry.slice(0, -2) + ':1');
        return target.protocol === base.protocol && target.hostname === base.hostname;
      }
      return target.origin === new URL(entry).origin;
    } catch {
      return false;
    }
  }

  private buildH5WechatCallbackUrl(params: {
    token?: string;
    appToken?: string;
    expiresIn?: number;
    error?: string;
    message?: string;
    redirect?: string;
    returnOrigin?: string | null;
  }) {
    const h5Base = this.resolveH5CallbackBaseUrl(params.returnOrigin).replace(/\/+$/, '');
    const url = new URL('/auth/wechat-callback', h5Base);
    if (params.token) url.searchParams.set('token', params.token);
    if (params.appToken) url.searchParams.set('appToken', params.appToken);
    if (params.expiresIn) url.searchParams.set('expiresIn', String(params.expiresIn));
    if (params.error) url.searchParams.set('error', params.error);
    if (params.message) url.searchParams.set('message', params.message);
    url.searchParams.set('redirect', this.normalizeH5RedirectPath(params.redirect));
    return url.toString();
  }

  private normalizeH5RedirectPath(value?: string | null) {
    const raw = String(value || '').trim();
    if (!raw) return '/';
    const h5Base = this.resolveH5BaseUrl();
    try {
      if (/^https?:\/\//i.test(raw)) {
        const target = new URL(raw);
        const h5 = new URL(h5Base);
        if (target.origin !== h5.origin) return '/';
        return `${target.pathname || '/'}${target.search || ''}${target.hash || ''}` || '/';
      }
    } catch {
      return '/';
    }
    if (raw.startsWith('//')) return '/';
    const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
    return prefixed.startsWith('/auth/wechat-callback') ? '/' : prefixed;
  }

  private normalizeRequestIp(request?: Request) {
    const forwarded = request?.headers?.['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return String(firstForwarded || request?.ip || '').split(',')[0].trim() || null;
  }

  private normalizeRequestUserAgent(request?: Request) {
    return String(request?.headers?.['user-agent'] || '').trim() || null;
  }

  private requireOfficialAccountAppId() {
    const value = String(process.env.WECHAT_MP_APPID || process.env.WECHAT_OFFICIAL_APPID || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MP_APPID，请在 .env 中配置微信服务号 AppID。');
    return value;
  }

  private requireOfficialAccountSecret() {
    const value = String(process.env.WECHAT_MP_SECRET || process.env.WECHAT_OFFICIAL_SECRET || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MP_SECRET，请在 .env 中配置微信服务号 AppSecret。');
    return value;
  }

  private requireMiniAppId() {
    const value = String(process.env.WECHAT_MINI_APPID || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MINI_APPID，请在 .env 中配置微信小程序 AppID。');
    return value;
  }

  private requireMiniSecret() {
    const value = String(process.env.WECHAT_MINI_SECRET || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_MINI_SECRET，请在 .env 中配置微信小程序 AppSecret。');
    return value;
  }

  private resolveEnvVersion(value?: WxEnvVersion) {
    const configured = String(value || process.env.WECHAT_MINI_ENV_VERSION || 'release').trim();
    if (configured === 'develop' || configured === 'trial' || configured === 'release') return configured;
    return 'release';
  }

  private createToken(openid?: string, sessionKey?: string) {
    const seed = [openid || '', sessionKey || '', randomBytes(16).toString('hex'), Date.now()].join(':');
    return createHash('sha256').update(seed).digest('hex');
  }

  private hashText(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private readBearerToken(authorization?: string) {
    const raw = String(authorization || '').trim();
    if (!raw) return '';
    return raw.replace(/^Bearer\s+/i, '').trim();
  }

  private async fetchWechatJson(url: string, init?: any): Promise<WechatJson> {
    const response = await fetch(url, init);
    const text = await response.text();
    const payload = this.safeJson(text);
    if (!response.ok) {
      throw new InternalServerErrorException(`微信接口请求失败：HTTP ${response.status}`);
    }
    return payload;
  }

  private safeJson(text: string): WechatJson {
    try {
      return JSON.parse(text || '{}') as WechatJson;
    } catch {
      return { raw: text };
    }
  }

  private assertWechatOk(payload: WechatJson, prefix: string) {
    const errcode = Number(payload?.errcode || 0);
    if (errcode !== 0) {
      const errmsg = String(payload?.errmsg || 'unknown error');
      throw new BadRequestException(`${prefix}：${errcode} ${errmsg}`);
    }
  }
}
