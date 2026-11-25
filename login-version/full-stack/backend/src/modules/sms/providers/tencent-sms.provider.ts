import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sms } from 'tencentcloud-sdk-nodejs';
import { SmsProvider, SmsSendRequest, SmsSendResult } from '../sms-provider.interface';

@Injectable()
export class TencentSmsProvider implements SmsProvider {
  private client?: InstanceType<typeof sms.v20210111.Client>;

  constructor(private readonly configService: ConfigService) {}

  assertConfigured() {
    const required = [
      'TENCENT_SMS_SECRET_ID',
      'TENCENT_SMS_SECRET_KEY',
      'TENCENT_SMS_SDK_APP_ID',
      'TENCENT_SMS_SIGN_NAME',
      'TENCENT_SMS_CODE_TEMPLATE_ID',
    ];
    const missing = required.filter((name) => !this.get(name));
    if (missing.length) {
      throw new Error(`SMS_PROVIDER=tencent 缺少必要配置：${missing.join(', ')}`);
    }
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    this.assertConfigured();
    const response = await this.getClient().SendSms({
      PhoneNumberSet: request.phoneNumbers.map((phone) => this.toE164(phone)),
      SmsSdkAppId: this.getRequired('TENCENT_SMS_SDK_APP_ID'),
      TemplateId: request.templateId,
      SignName: this.getRequired('TENCENT_SMS_SIGN_NAME'),
      TemplateParamSet: request.templateParams ?? [],
      SessionContext: request.sessionContext,
      ...(this.get('TENCENT_SMS_EXTEND_CODE') ? { ExtendCode: this.get('TENCENT_SMS_EXTEND_CODE') } : {}),
    });

    const statuses = (response.SendStatusSet ?? []).map((status) => ({
      phone: String(status.PhoneNumber ?? ''),
      code: String(status.Code ?? ''),
      message: status.Message ? String(status.Message) : undefined,
      serialNo: status.SerialNo ? String(status.SerialNo) : undefined,
    }));

    const failed = statuses.filter((status) => status.code !== 'Ok');
    if (statuses.length !== request.phoneNumbers.length || failed.length) {
      const failureSummary = failed
        .map((status) => `${status.phone || 'unknown'}:${status.code || 'UNKNOWN'}`)
        .join(', ');
      throw new Error(`腾讯云短信未受理：${failureSummary || '返回状态数量异常'}`);
    }

    return {
      provider: 'tencent',
      requestId: response.RequestId ? String(response.RequestId) : undefined,
      statuses,
    };
  }

  private getClient() {
    if (!this.client) {
      this.client = new sms.v20210111.Client({
        credential: {
          secretId: this.getRequired('TENCENT_SMS_SECRET_ID'),
          secretKey: this.getRequired('TENCENT_SMS_SECRET_KEY'),
        },
        region: this.get('TENCENT_SMS_REGION') || 'ap-guangzhou',
      });
    }
    return this.client;
  }

  private getRequired(name: string) {
    const value = this.get(name);
    if (!value) throw new Error(`缺少腾讯云短信配置：${name}`);
    return value;
  }

  private get(name: string) {
    return String(this.configService.get<string>(name) ?? '').trim();
  }

  private toE164(phone: string) {
    const normalized = String(phone ?? '').replace(/[^0-9]/g, '');
    if (normalized.startsWith('86') && normalized.length === 13) return `+${normalized}`;
    return `+86${normalized}`;
  }
}
