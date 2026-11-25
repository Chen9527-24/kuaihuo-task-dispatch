export type SmsProviderName = 'mock' | 'tencent';

export type SmsSendRequest = {
  phoneNumbers: string[];
  templateId: string;
  templateParams?: string[];
  sessionContext?: string;
};

export type SmsSendStatus = {
  phone: string;
  code: string;
  message?: string;
  serialNo?: string;
};

export type SmsSendResult = {
  provider: SmsProviderName;
  requestId?: string;
  statuses: SmsSendStatus[];
};

export interface SmsProvider {
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}
