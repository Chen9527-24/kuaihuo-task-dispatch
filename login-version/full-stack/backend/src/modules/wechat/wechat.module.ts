import { Module } from '@nestjs/common';
import { MiniProgramModeController, PlatformGuideController, WechatOpenController, WxMiniController } from './wechat.controller';
import { WechatService } from './wechat.service';

@Module({
  controllers: [MiniProgramModeController, WxMiniController, WechatOpenController, PlatformGuideController],
  providers: [WechatService],
  exports: [WechatService],
})
export class WechatModule {}
