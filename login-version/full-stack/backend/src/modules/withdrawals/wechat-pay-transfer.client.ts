import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv, randomBytes, sign, verify } from 'crypto';
import { readFileSync } from 'fs';

export interface WechatTransferApplyInput {
  outBillNo: string;
  openid: string;
  amount: number;
  remark?: string | null;
}

export interface WechatTransferApplyResult {
  out_bill_no: string;
  transfer_bill_no?: string;
  create_time?: string;
  state?: string;
  fail_reason?: string;
  package_info?: string;
  raw: Record<string, unknown>;
}

export interface WechatTransferQueryResult extends WechatTransferApplyResult {}

export interface WechatTransferNotifyResource {
  algorithm?: string;
  ciphertext: string;
  associated_data?: string;
  nonce: string;
  original_type?: string;
}

@Injectable()
export class WechatPayTransferClient {
  private readonly logger = new Logger(WechatPayTransferClient.name);
  private cachedPrivateKey?: string;
  private cachedPublicKey?: string;

  constructor(private readonly configService: ConfigService) {}

  async createTransfer(input: WechatTransferApplyInput): Promise<WechatTransferApplyResult> {
    const body = {
      appid: this.requireAppId(),
      out_bill_no: input.outBillNo,
      transfer_scene_id: this.resolveTransferSceneId(),
      openid: input.openid,
      transfer_amount: input.amount,
      transfer_remark: this.normalizeTransferRemark(input.remark),
      notify_url: this.requireNotifyUrl(),
      user_recv_perception: this.resolveUserRecvPerception(),
      transfer_scene_report_infos: this.resolveSceneReportInfos(),
    };
    const raw = await this.request('POST', '/v3/fund-app/mch-transfer/transfer-bills', body);
    return this.normalizeTransferPayload(raw, input.outBillNo);
  }

  async queryByOutBillNo(outBillNo: string): Promise<WechatTransferQueryResult> {
    const clean = this.normalizeOutBillNo(outBillNo);
    const raw = await this.request('GET', `/v3/fund-app/mch-transfer/transfer-bills/out-bill-no/${encodeURIComponent(clean)}`);
    return this.normalizeTransferPayload(raw, clean);
  }

  verifyWechatpaySignature(params: { timestamp?: string; nonce?: string; signature?: string; serial?: string; body: string }) {
    const timestamp = String(params.timestamp || '').trim();
    const nonce = String(params.nonce || '').trim();
    const signatureText = String(params.signature || '').trim();
    if (!timestamp || !nonce || !signatureText) {
      throw new BadRequestException('微信支付回调缺少签名头');
    }
    const expectedSerial = String(this.configService.get<string>('WECHAT_PAY_PUBLIC_KEY_ID', '') || '').trim();
    const actualSerial = String(params.serial || '').trim();
    if (!expectedSerial || expectedSerial !== actualSerial) {
      throw new BadRequestException('微信支付回调公钥序列号不匹配');
    }
    if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      throw new BadRequestException('微信支付签名时间已过期');
    }
    const message = `${timestamp}\n${nonce}\n${params.body}\n`;
    const publicKey = this.getPublicKey();
    const ok = verify('RSA-SHA256', Buffer.from(message), publicKey, Buffer.from(signatureText, 'base64'));
    if (!ok) {
      throw new BadRequestException('微信支付回调签名验证失败');
    }
  }

  decryptResource(resource: WechatTransferNotifyResource) {
    if (!resource?.ciphertext || !resource?.nonce) {
      throw new BadRequestException('微信支付回调 resource 参数不完整');
    }
    const key = this.requireApiV3Key();
    const ciphertext = Buffer.from(resource.ciphertext, 'base64');
    if (ciphertext.length <= 16) {
      throw new BadRequestException('微信支付回调密文长度异常');
    }
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), Buffer.from(resource.nonce, 'utf8'));
    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    }
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    try {
      return JSON.parse(plain) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('微信支付回调解密结果不是合法 JSON');
    }
  }

  private async request(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
    const bodyText = body ? JSON.stringify(body) : '';
    const authorization = this.buildAuthorization(method, path, bodyText);
    const headers: Record<string, string> = {
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const url = `${this.resolveApiBase()}${path}`;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? bodyText : undefined,
    });
    const text = await response.text();
    if (response.ok) {
      this.verifyWechatpaySignature({
        timestamp: response.headers.get('Wechatpay-Timestamp') || undefined,
        nonce: response.headers.get('Wechatpay-Nonce') || undefined,
        serial: response.headers.get('Wechatpay-Serial') || undefined,
        signature: response.headers.get('Wechatpay-Signature') || undefined,
        body: text,
      });
    }
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { raw: text };
      }
    }
    if (!response.ok) {
      const code = String(payload.code || payload.error_code || response.status).trim();
      const message = String(payload.message || payload.error_message || payload.raw || '微信支付接口调用失败').trim();
      this.logger.warn(`WechatPay transfer request failed: ${response.status} ${code} ${message}`);
      throw new BadRequestException(`微信支付接口调用失败：${code} ${message}`);
    }
    return payload;
  }

  private buildAuthorization(method: string, path: string, bodyText: string) {
    const mchid = this.requireMchId();
    const serialNo = this.requireMerchantSerialNo();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString('hex');
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyText}\n`;
    const privateKey = this.getPrivateKey();
    const signature = sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64');
    return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
  }

  private normalizeTransferPayload(raw: Record<string, unknown>, expectedOutBillNo: string): WechatTransferApplyResult {
    if (raw.out_bill_no !== expectedOutBillNo) {
      throw new BadRequestException('微信支付应答与当前商户提现单号不符');
    }
    return {
      out_bill_no: String(raw.out_bill_no || '').trim(),
      transfer_bill_no: String(raw.transfer_bill_no || '').trim() || undefined,
      create_time: String(raw.create_time || '').trim() || undefined,
      state: String(raw.state || '').trim() || undefined,
      fail_reason: String(raw.fail_reason || '').trim() || undefined,
      package_info: String(raw.package_info || '').trim() || undefined,
      raw,
    };
  }

  private normalizeOutBillNo(value: string) {
    const clean = String(value || '').trim();
    if (!/^[0-9A-Za-z]{1,32}$/.test(clean)) throw new BadRequestException('商户提现单号格式不正确');
    return clean;
  }

  private resolveApiBase() {
    return String(this.configService.get<string>('WECHAT_PAY_API_BASE_URL', '') || 'https://api.mch.weixin.qq.com').replace(/\/+$/, '');
  }

  private requireMchId() {
    const value = String(this.configService.get<string>('WECHAT_PAY_MCH_ID', '') || process.env.WECHAT_PAY_MCH_ID || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_PAY_MCH_ID，无法调用微信支付商家转账。');
    return value;
  }

  private requireAppId() {
    const value = String(
      this.configService.get<string>('WECHAT_PAY_APP_ID', '') ||
        process.env.WECHAT_PAY_APP_ID ||
        process.env.WECHAT_MP_APPID ||
        process.env.WECHAT_OFFICIAL_APPID ||
        '',
    ).trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_PAY_APP_ID 或 WECHAT_MP_APPID，无法调用微信支付商家转账。');
    return value;
  }

  private requireNotifyUrl() {
    const value = String(this.configService.get<string>('WECHAT_PAY_NOTIFY_URL', '') || process.env.WECHAT_PAY_NOTIFY_URL || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_PAY_NOTIFY_URL，无法接收微信提现结果回调。');
    return value;
  }

  private resolveTransferSceneId() {
    const scene = String(this.configService.get<string>('WECHAT_PAY_TRANSFER_SCENE_ID') || '').trim();
    if (!scene) throw new BadRequestException('请填写商户平台已获准的转账场景 ID');
    return scene;
  }

  private resolveUserRecvPerception() {
    return String(
      this.configService.get<string>('WECHAT_PAY_USER_RECV_PERCEPTION', '') ||
        process.env.WECHAT_PAY_USER_RECV_PERCEPTION ||
        process.env.WECHAT_TRANSFER_USER_RECV_PERCEPTION ||
        '现金奖励',
    ).trim();
  }

  private resolveSceneReportInfos() {
    const raw = String(
      this.configService.get<string>('WECHAT_PAY_TRANSFER_SCENE_REPORT_INFOS', '') ||
        process.env.WECHAT_PAY_TRANSFER_SCENE_REPORT_INFOS ||
        process.env.WECHAT_TRANSFER_SCENE_REPORT_INFOS ||
        '',
    ).trim();
    if (!raw) return undefined;
    let fields: unknown;
    try {
      fields = JSON.parse(raw);
    } catch {
      throw new BadRequestException('转账场景报备配置需要填写合法的 JSON 数组');
    }
    if (!Array.isArray(fields) || !fields.every((entry) =>
      entry && typeof entry.info_type === 'string' && entry.info_type.trim() &&
      typeof entry.info_content === 'string' && entry.info_content.trim()
    )) {
      throw new BadRequestException('每项转账报备字段均需填写 info_type 和 info_content');
    }
    return fields.map(({ info_type, info_content }) => ({ info_type, info_content }));
  }

  private normalizeTransferRemark(value?: string | null) {
    const text = String(value || '用户收益提现').trim() || '用户收益提现';
    return text.length > 32 ? text.slice(0, 32) : text;
  }

  private requireMerchantSerialNo() {
    const value = String(
      this.configService.get<string>('WECHAT_PAY_MERCHANT_SERIAL_NO', '') ||
        process.env.WECHAT_PAY_MERCHANT_SERIAL_NO ||
        process.env.WECHAT_PAY_MCH_SERIAL_NO ||
        '',
    ).trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_PAY_MERCHANT_SERIAL_NO，无法生成微信支付请求签名。');
    return value;
  }

  private getPrivateKey() {
    if (this.cachedPrivateKey) return this.cachedPrivateKey;
    const raw = String(this.configService.get<string>('WECHAT_PAY_PRIVATE_KEY', '') || process.env.WECHAT_PAY_PRIVATE_KEY || '').trim();
    if (raw) {
      this.cachedPrivateKey = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
      return this.cachedPrivateKey;
    }
    const path = String(this.configService.get<string>('WECHAT_PAY_PRIVATE_KEY_PATH', '') || process.env.WECHAT_PAY_PRIVATE_KEY_PATH || '').trim();
    if (!path) throw new BadRequestException('缺少 WECHAT_PAY_PRIVATE_KEY_PATH，无法读取商户私钥。');
    this.cachedPrivateKey = readFileSync(path, 'utf8');
    return this.cachedPrivateKey;
  }

  private getPublicKey() {
    if (this.cachedPublicKey) return this.cachedPublicKey;
    const raw = String(this.configService.get<string>('WECHAT_PAY_PUBLIC_KEY', '') || process.env.WECHAT_PAY_PUBLIC_KEY || '').trim();
    if (raw) {
      this.cachedPublicKey = raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
      return this.cachedPublicKey;
    }
    const path = String(this.configService.get<string>('WECHAT_PAY_PUBLIC_KEY_PATH', '') || process.env.WECHAT_PAY_PUBLIC_KEY_PATH || '').trim();
    if (!path) throw new BadRequestException('缺少 WECHAT_PAY_PUBLIC_KEY_PATH，无法验证微信支付回调签名。');
    this.cachedPublicKey = readFileSync(path, 'utf8');
    return this.cachedPublicKey;
  }

  private requireApiV3Key() {
    const value = String(this.configService.get<string>('WECHAT_PAY_API_V3_KEY', '') || process.env.WECHAT_PAY_API_V3_KEY || '').trim();
    if (!value) throw new BadRequestException('缺少 WECHAT_PAY_API_V3_KEY，无法解密微信支付回调。');
    if (Buffer.byteLength(value, 'utf8') !== 32) throw new BadRequestException('WECHAT_PAY_API_V3_KEY 必须是 32 位字符串。');
    return value;
  }
}
