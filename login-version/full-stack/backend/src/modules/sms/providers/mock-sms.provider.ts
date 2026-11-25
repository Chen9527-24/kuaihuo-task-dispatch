import { Injectable } from '@nestjs/common';
import { SmsProvider, SmsSendRequest, SmsSendResult } from '../sms-provider.interface';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    return {
      provider: 'mock',
      statuses: request.phoneNumbers.map((phone) => ({
        phone,
        code: 'Ok',
        message: 'MOCK_ACCEPTED',
      })),
    };
  }
}
