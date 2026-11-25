import { Module } from '@nestjs/common';
import { H5WithdrawalsController, WechatPayTransferController, WithdrawalsAdminController } from './withdrawals.controller';
import { WechatPayTransferClient } from './wechat-pay-transfer.client';
import { WithdrawalsService } from './withdrawals.service';

@Module({
  controllers: [H5WithdrawalsController, WithdrawalsAdminController, WechatPayTransferController],
  providers: [WithdrawalsService, WechatPayTransferClient],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
