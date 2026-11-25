import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendSmsNotificationDto } from './dto/sms-notification.dto';
import { SmsService } from './sms.service';

@ApiTags('管理端-短信')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'sms', version: '1' })
export class SmsAdminController {
  constructor(private readonly smsService: SmsService) {}

  @Post('notifications')
  @Permissions('sms:send')
  @ApiOperation({
    summary: '发送普通模板通知短信',
    description: '仅允许服务端预设的 templateKey；不支持传入任意短信正文或任意腾讯云模板 ID。',
  })
  sendNotification(@Body() dto: SendSmsNotificationDto) {
    return this.smsService.sendNotification(dto);
  }
}
