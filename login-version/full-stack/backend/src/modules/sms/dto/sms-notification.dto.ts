import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export const SMS_NOTIFICATION_TEMPLATE_KEYS = [
  'task_rejected',
  'task_settled',
  'withdrawal_approved',
  'withdrawal_rejected',
  'account_disabled',
] as const;

export type SmsNotificationTemplateKey = (typeof SMS_NOTIFICATION_TEMPLATE_KEYS)[number];

export class SendSmsNotificationDto {
  @ApiProperty({ example: '1XXXXXXXXXX', description: '接收通知短信的中国大陆手机号。' })
  @IsString()
  @Length(11, 11)
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({
    enum: SMS_NOTIFICATION_TEMPLATE_KEYS,
    example: 'task_rejected',
    description: '服务端白名单模板键。实际腾讯云模板 ID 由后端环境变量映射，不能由调用方传入。',
  })
  @IsIn(SMS_NOTIFICATION_TEMPLATE_KEYS)
  templateKey!: SmsNotificationTemplateKey;

  @ApiPropertyOptional({
    type: [String],
    example: ['任务标题', '请按审核意见重新提交'],
    description: '模板变量，顺序和数量必须与腾讯云已审核模板完全一致；没有变量时可不传。',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  templateParams?: string[];
}
