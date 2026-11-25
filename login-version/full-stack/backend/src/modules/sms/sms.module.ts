import { Module } from '@nestjs/common';
import { SmsAdminController } from './sms-admin.controller';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { TencentSmsProvider } from './providers/tencent-sms.provider';
import { SmsService } from './sms.service';

@Module({
  controllers: [SmsAdminController],
  providers: [SmsService, MockSmsProvider, TencentSmsProvider],
  exports: [SmsService],
})
export class SmsModule {}
